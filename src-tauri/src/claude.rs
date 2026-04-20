use std::process::{Command, Stdio};
use tauri::{AppHandle, Emitter};
use tokio::io::AsyncReadExt;

/// Concise format reference embedded in the system prompt when generating a
/// new notebook. Kept short so the CLI doesn't hit argv length limits on
/// Windows; verbose enough that Claude produces a valid .tbk without looking
/// at the parser.
const TBK_FORMAT_GUIDE: &str = r#"
You generate Teachbook notebooks (.tbk files). A .tbk file is Markdown with:

1. YAML frontmatter: title, subject, author, version (0.1)
2. Prose (Markdown) explaining the concept
3. Exactly ONE fenced code block per cell — the "solution steps". Python or plain text.
4. Scene blocks: ```scene step=N narration="..." code_lines=M-K
   with JSON body: {"primitives": [...]}
5. Optional quiz section:
   ## Quiz
   ?? question text
   >> rubric / expected answer

Scene primitive types (pick those that fit; all have type=<name>):
- grid: { type: "grid", values: [...], highlight?: [indices] }
- shape: { type: "shape", shape: "circle"|"rect"|"polygon", x, y, radius?, width?, height?, fill?, stroke? }
- arrow: { type: "arrow", from: [x, y], to: [x, y], label? }
- label: { type: "label", x, y, text, latex? }
  // When latex is true, `text` is a LaTeX expression (e.g. "v_y = \\frac{1}{2} g t^2").
  // Prefer LaTeX for any equation. Escape backslashes in JSON: \\frac, \\theta, \\approx.
- axes: { type: "axes", xMin, xMax, yMin, yMax }  // include with physics/plots
- plot: { type: "plot", points: [[x,y],...], label? }
- graph: { type: "graph", nodes: [{id, x, y, label?}], edges: [[a,b],...] }

Prose supports LaTeX too: inline $...$ and block $$...$$. Prefer this over
unicode subscripts or fractions.

Coordinate rules:
- With axes, use the domain units (meters, seconds, etc.). Other primitives auto-project.
- Without axes, positions are in a fixed 800x500 viewBox.

code_lines is 1-indexed and relative to the cell's code block (not the source file).
Use it on EVERY scene block so students see the debugger-style line highlight.

Quality bar:
- 4-8 scene steps per concept, each with a clear narration.
- Steps advance the story; don't repeat scenes.
- Respond with ONLY the .tbk file contents. Start with --- and end with the last char.
  Do NOT wrap your response in ```markdown fences.
"#;

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

#[tauri::command]
pub async fn claude_generate_notebook(request: String) -> Result<String, String> {
    let system = TBK_FORMAT_GUIDE.to_string();
    let user = format!(
        "Generate a Teachbook notebook for this request:\n\n{request}\n\n\
         Remember: respond with ONLY the raw .tbk file contents starting with ---. \
         No prose before, no code fences around it."
    );
    let raw = claude_prompt(user, Some(system)).await?;
    // Strip accidental outer code fences if Claude adds them
    let cleaned = strip_outer_fence(&raw);
    Ok(cleaned.to_string())
}

fn strip_outer_fence(s: &str) -> &str {
    let trimmed = s.trim();
    // Match ```markdown\n...\n``` or ```\n...\n```
    if let Some(stripped) = trimmed.strip_prefix("```markdown\n").or_else(|| {
        trimmed.strip_prefix("```md\n").or_else(|| trimmed.strip_prefix("```\n"))
    }) {
        if let Some(inner) = stripped.strip_suffix("\n```") {
            return inner;
        }
        if let Some(inner) = stripped.strip_suffix("```") {
            return inner;
        }
    }
    trimmed
}

/// Streaming variant of `claude_prompt`. Emits `claude-chunk-{request_id}`
/// events as stdout bytes arrive, then `claude-done-{request_id}` with the
/// full concatenated response, or `claude-error-{request_id}` with stderr on
/// non-zero exit. The command returns as soon as the child process is spawned;
/// the frontend is responsible for listening to events.
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

    let chunk_event = format!("claude-chunk-{request_id}");
    let done_event = format!("claude-done-{request_id}");
    let error_event = format!("claude-error-{request_id}");

    // Drain stdout as chunks arrive.
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

    // Drain stderr in parallel (for error reporting).
    let stderr_task = tokio::spawn(async move {
        let mut reader = stderr;
        let mut s = String::new();
        let _ = reader.read_to_string(&mut s).await;
        s
    });

    let status = child
        .wait()
        .await
        .map_err(|e| format!("wait failed: {e}"))?;
    let full = stdout_task.await.unwrap_or_default();
    let err = stderr_task.await.unwrap_or_default();

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
