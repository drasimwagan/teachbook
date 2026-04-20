use std::collections::HashMap;
use std::process::{Command, Stdio};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::io::AsyncReadExt;

/// Per-request process registry. Holds the OS pid of the `claude` child so
/// `claude_cancel` can signal it. Entries are inserted when a stream starts
/// and removed when it finishes (success, error, or cancel).
#[derive(Default)]
pub struct ClaudeState {
    pids: Mutex<HashMap<String, u32>>,
}

impl ClaudeState {
    fn insert(&self, id: &str, pid: u32) {
        if let Ok(mut m) = self.pids.lock() {
            m.insert(id.to_string(), pid);
        }
    }
    fn remove(&self, id: &str) -> Option<u32> {
        self.pids.lock().ok().and_then(|mut m| m.remove(id))
    }
}

/// Resolve a usable path to the `claude` binary. Tauri apps on macOS launched
/// from Finder don't inherit the user's shell PATH; try common install paths
/// before giving up.
fn resolve_claude_binary() -> String {
    if let Ok(path) = std::env::var("TEACHBOOK_CLAUDE_BIN") {
        return path;
    }
    let candidates = [
        "claude",
        "/opt/homebrew/bin/claude",
        "/usr/local/bin/claude",
    ];
    for cand in candidates.iter() {
        if Command::new(cand).arg("--version").output().is_ok() {
            return cand.to_string();
        }
    }
    if let Ok(home) = std::env::var("HOME") {
        let p = format!("{home}/.local/bin/claude");
        if Command::new(&p).arg("--version").output().is_ok() {
            return p;
        }
    }
    "claude".to_string()
}

#[tauri::command]
pub async fn claude_prompt(
    prompt: String,
    system_prompt: Option<String>,
) -> Result<String, String> {
    tokio::task::spawn_blocking(move || {
        let bin = resolve_claude_binary();
        let mut cmd = Command::new(&bin);
        cmd.arg("-p").arg(&prompt);
        if let Some(sys) = system_prompt {
            cmd.arg("--append-system-prompt").arg(sys);
        }
        let output = cmd.output().map_err(|e| {
            format!(
                "Failed to launch '{bin}'. Is Claude Code installed and in PATH? ({e})"
            )
        })?;
        if !output.status.success() {
            return Err(format!(
                "claude exited with status {}: {}",
                output.status,
                String::from_utf8_lossy(&output.stderr)
            ));
        }
        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    })
    .await
    .map_err(|e| format!("task join error: {e}"))?
}

/// Streaming variant of `claude_prompt`. Emits `claude-chunk-{request_id}`
/// events as stdout bytes arrive, then `claude-done-{request_id}` with the
/// full concatenated response, or `claude-error-{request_id}` with stderr on
/// non-zero exit. Register the child's pid so `claude_cancel` can abort it.
#[tauri::command]
pub async fn claude_prompt_stream(
    app: AppHandle,
    request_id: String,
    prompt: String,
    system_prompt: Option<String>,
) -> Result<(), String> {
    let bin = resolve_claude_binary();
    let mut cmd = tokio::process::Command::new(&bin);
    cmd.arg("-p").arg(&prompt);
    if let Some(sys) = system_prompt {
        cmd.arg("--append-system-prompt").arg(sys);
    }
    cmd.stdout(Stdio::piped());
    cmd.stderr(Stdio::piped());

    let mut child = cmd
        .spawn()
        .map_err(|e| format!("Failed to launch '{bin}': {e}"))?;
    let stdout = child.stdout.take().ok_or("claude child has no stdout")?;
    let stderr = child.stderr.take().ok_or("claude child has no stderr")?;

    // Register pid for cancel lookup.
    let state: State<'_, ClaudeState> = app.state();
    if let Some(pid) = child.id() {
        state.insert(&request_id, pid);
    }

    let chunk_event = format!("claude-chunk-{request_id}");
    let done_event = format!("claude-done-{request_id}");
    let error_event = format!("claude-error-{request_id}");

    let app_out = app.clone();
    let chunk_ev = chunk_event.clone();
    let stdout_task = tokio::spawn(async move {
        let mut reader = stdout;
        let mut buf = [0u8; 4096];
        let mut collected = String::new();
        loop {
            match reader.read(&mut buf).await {
                Ok(0) => break,
                Ok(n) => {
                    let text = String::from_utf8_lossy(&buf[..n]).to_string();
                    collected.push_str(&text);
                    let _ = app_out.emit(&chunk_ev, text);
                }
                Err(_) => break,
            }
        }
        collected
    });

    let stderr_task = tokio::spawn(async move {
        let mut reader = stderr;
        let mut s = String::new();
        let _ = reader.read_to_string(&mut s).await;
        s
    });

    let status_result = child.wait().await;

    // Always clear pid registration, whether we succeeded, errored, or were cancelled.
    let cancelled = state.remove(&request_id).is_none();

    let status = match status_result {
        Ok(s) => s,
        Err(e) => return Err(format!("wait failed: {e}")),
    };

    let full = stdout_task.await.unwrap_or_default();
    let err = stderr_task.await.unwrap_or_default();

    if cancelled {
        // User-initiated abort. Don't emit error — just close the stream.
        let _ = app.emit(&done_event, full.trim().to_string());
        return Ok(());
    }

    if !status.success() {
        let msg = if err.is_empty() {
            format!("claude exited with status {status}")
        } else {
            err
        };
        let _ = app.emit(&error_event, msg.clone());
        return Err(msg);
    }

    let _ = app.emit(&done_event, full.trim().to_string());
    Ok(())
}

/// Cancel an in-flight streaming request. Sends SIGTERM to the pid registered
/// by `claude_prompt_stream`. No-op if the request already finished.
#[tauri::command]
pub fn claude_cancel(state: State<ClaudeState>, request_id: String) -> Result<(), String> {
    let Some(pid) = state.remove(&request_id) else {
        return Ok(());
    };
    #[cfg(unix)]
    {
        // SAFETY: passing a valid pid; SIGTERM is a well-defined signal.
        unsafe { libc::kill(pid as i32, libc::SIGTERM) };
    }
    #[cfg(windows)]
    {
        // On Windows we can't SIGTERM; cancel becomes best-effort (the request
        // will still finish in the background). Documented limitation for v1.
        let _ = pid;
    }
    Ok(())
}

#[tauri::command]
pub fn claude_check() -> Result<String, String> {
    let bin = resolve_claude_binary();
    let output = Command::new(&bin)
        .arg("--version")
        .output()
        .map_err(|e| format!("'{bin}' not runnable: {e}"))?;
    if !output.status.success() {
        return Err(format!(
            "claude --version failed: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }
    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}
