//! Teaching server — an axum HTTP server that serves the teacher's
//! locked notebooks and accepts student submissions.
//!
//! No authentication by design in this MVP. Runs on the teacher's LAN.
//! A student hits:
//!   GET  /api/ping              — identify server
//!   GET  /api/quizzes           — list published (locked) notebooks
//!   GET  /api/quizzes/:id       — raw .tbk content
//!   POST /api/submissions       — upload a progress JSON
//!   GET  /api/submissions       — list received submissions (teacher-side)
//!
//! We expose published = `locked: true` in the notebook's frontmatter.
//! No server code parses YAML — we scan the first lines for a `locked:`
//! key, which is robust enough for our frontmatter shape.

use axum::{
    extract::{Path, State},
    http::{header, StatusCode},
    response::{IntoResponse, Response},
    routing::{get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use std::net::SocketAddr;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use tokio::net::TcpListener;
use tokio::sync::oneshot;
use tower_http::cors::{Any, CorsLayer};

#[derive(Clone)]
struct AppState {
    notebooks_dir: PathBuf,
    submissions_dir: PathBuf,
}

fn teachbook_subdir(name: &str) -> Result<PathBuf, String> {
    let home = dirs::home_dir().ok_or_else(|| "Could not resolve $HOME".to_string())?;
    let dir = home.join("Teachbook").join(name);
    if !dir.exists() {
        std::fs::create_dir_all(&dir)
            .map_err(|e| format!("Failed to create {}: {e}", dir.display()))?;
    }
    Ok(dir)
}

#[derive(Serialize)]
struct PingResponse {
    name: &'static str,
    version: &'static str,
    role: &'static str,
}

async fn ping() -> Json<PingResponse> {
    Json(PingResponse {
        name: "Teachbook",
        version: env!("CARGO_PKG_VERSION"),
        role: "teaching_server",
    })
}

#[derive(Serialize)]
struct QuizMeta {
    id: String,
    title: String,
    subject: String,
    tags: Vec<String>,
}

/// Walk the teacher's notebooks dir, collect `.tbk` files with a
/// `locked: true` frontmatter entry.
async fn list_quizzes(State(state): State<AppState>) -> Result<Json<Vec<QuizMeta>>, ApiError> {
    let mut out: Vec<QuizMeta> = Vec::new();
    let entries = std::fs::read_dir(&state.notebooks_dir)
        .map_err(|e| ApiError::internal(format!("read notebooks dir: {e}")))?;
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let ext = path
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("")
            .to_ascii_lowercase();
        if ext != "tbk" && ext != "md" {
            continue;
        }
        let content = match std::fs::read_to_string(&path) {
            Ok(c) => c,
            Err(_) => continue,
        };
        let meta = parse_frontmatter(&content);
        if !meta.locked {
            continue;
        }
        let id = path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("unnamed")
            .to_string();
        out.push(QuizMeta {
            id,
            title: meta.title.unwrap_or_else(|| "Untitled".to_string()),
            subject: meta.subject.unwrap_or_default(),
            tags: meta.tags,
        });
    }
    out.sort_by(|a, b| a.title.to_lowercase().cmp(&b.title.to_lowercase()));
    Ok(Json(out))
}

async fn get_quiz(
    Path(id): Path<String>,
    State(state): State<AppState>,
) -> Result<Response, ApiError> {
    let safe_id = sanitize_id(&id)?;
    let file_path = state.notebooks_dir.join(format!("{safe_id}.tbk"));
    if !file_path.exists() {
        return Err(ApiError::not_found(format!("no quiz with id '{id}'")));
    }
    let content = std::fs::read_to_string(&file_path)
        .map_err(|e| ApiError::internal(format!("read quiz: {e}")))?;
    let fm = parse_frontmatter(&content);
    if !fm.locked {
        // Defence in depth: only serve locked notebooks even if someone
        // guesses a filename for an unlocked personal notebook.
        return Err(ApiError::forbidden("quiz is not published"));
    }
    Ok(([(header::CONTENT_TYPE, "text/markdown; charset=utf-8")], content).into_response())
}

#[derive(Deserialize)]
struct SubmissionIn(serde_json::Value);

#[derive(Serialize)]
struct SubmissionOut {
    ok: bool,
    id: String,
}

async fn post_submission(
    State(state): State<AppState>,
    Json(body): Json<SubmissionIn>,
) -> Result<Json<SubmissionOut>, ApiError> {
    let now = chrono::Utc::now().format("%Y%m%dT%H%M%SZ").to_string();
    // Try to pull a slug from the submitted progress for a nicer filename.
    let slug = body
        .0
        .get("notebookTitle")
        .and_then(|v| v.as_str())
        .map(slugify)
        .unwrap_or_else(|| "submission".to_string());
    let student = body
        .0
        .get("student")
        .and_then(|v| v.as_str())
        .map(slugify)
        .unwrap_or_else(|| "anon".to_string());
    let id = format!("{slug}-{student}-{now}");
    let file_path = state.submissions_dir.join(format!("{id}.json"));
    let pretty = serde_json::to_string_pretty(&body.0)
        .map_err(|e| ApiError::bad(format!("serialize: {e}")))?;
    std::fs::write(&file_path, pretty)
        .map_err(|e| ApiError::internal(format!("write submission: {e}")))?;
    Ok(Json(SubmissionOut { ok: true, id }))
}

#[derive(Serialize)]
struct SubmissionListItem {
    id: String,
    received_at: String,
    notebook_title: Option<String>,
    student: Option<String>,
    correct: usize,
    attempted: usize,
}

async fn list_submissions(
    State(state): State<AppState>,
) -> Result<Json<Vec<SubmissionListItem>>, ApiError> {
    let mut out: Vec<SubmissionListItem> = Vec::new();
    let entries = std::fs::read_dir(&state.submissions_dir)
        .map_err(|e| ApiError::internal(format!("read submissions dir: {e}")))?;
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("json") {
            continue;
        }
        let id = path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("")
            .to_string();
        let meta = std::fs::metadata(&path).ok();
        let received_at = meta
            .as_ref()
            .and_then(|m| m.modified().ok())
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| {
                chrono::DateTime::<chrono::Utc>::from_timestamp(d.as_secs() as i64, 0)
                    .map(|t| t.to_rfc3339())
                    .unwrap_or_default()
            })
            .unwrap_or_default();
        let raw = std::fs::read_to_string(&path).unwrap_or_default();
        let v: serde_json::Value = serde_json::from_str(&raw).unwrap_or_default();
        let notebook_title = v
            .get("notebookTitle")
            .and_then(|s| s.as_str())
            .map(|s| s.to_string());
        let student = v
            .get("student")
            .and_then(|s| s.as_str())
            .map(|s| s.to_string());
        let (correct, attempted) = count_grade(&v);
        out.push(SubmissionListItem {
            id,
            received_at,
            notebook_title,
            student,
            correct,
            attempted,
        });
    }
    out.sort_by(|a, b| b.received_at.cmp(&a.received_at));
    Ok(Json(out))
}

fn count_grade(v: &serde_json::Value) -> (usize, usize) {
    let answers = v.get("answers").and_then(|a| a.as_array());
    let mut correct = 0usize;
    let mut attempted = 0usize;
    if let Some(arr) = answers {
        for a in arr {
            if a.get("answer")
                .and_then(|s| s.as_str())
                .map(|s| !s.trim().is_empty())
                .unwrap_or(false)
            {
                attempted += 1;
            }
            if a.get("grade")
                .and_then(|g| g.get("correct"))
                .and_then(|b| b.as_bool())
                .unwrap_or(false)
            {
                correct += 1;
            }
        }
    }
    (correct, attempted)
}

// --- frontmatter + helpers ------------------------------------------------

#[derive(Default, Debug)]
struct Frontmatter {
    title: Option<String>,
    subject: Option<String>,
    tags: Vec<String>,
    locked: bool,
}

fn parse_frontmatter(content: &str) -> Frontmatter {
    let mut fm = Frontmatter::default();
    let mut lines = content.lines();
    if lines.next().map(str::trim) != Some("---") {
        return fm;
    }
    for line in lines {
        let t = line.trim();
        if t == "---" {
            break;
        }
        if let Some(rest) = t.strip_prefix("title:") {
            fm.title = Some(unquote(rest.trim()).to_string());
        } else if let Some(rest) = t.strip_prefix("subject:") {
            fm.subject = Some(unquote(rest.trim()).to_string());
        } else if let Some(rest) = t.strip_prefix("locked:") {
            fm.locked = rest.trim().eq_ignore_ascii_case("true");
        } else if let Some(rest) = t.strip_prefix("tags:") {
            fm.tags = parse_inline_tags(rest.trim());
        }
    }
    fm
}

fn unquote(s: &str) -> &str {
    s.trim_matches(|c| c == '"' || c == '\'')
}

fn parse_inline_tags(s: &str) -> Vec<String> {
    // Accept `[a, b, c]` or `a, b, c`. Hand-rolled rather than adding a YAML dep.
    let inner = s.trim_start_matches('[').trim_end_matches(']');
    inner
        .split(',')
        .map(|t| unquote(t.trim()).to_string())
        .filter(|t| !t.is_empty())
        .collect()
}

fn sanitize_id(s: &str) -> Result<String, ApiError> {
    if s.contains('/') || s.contains('\\') || s.contains("..") {
        return Err(ApiError::bad("invalid id"));
    }
    if !s
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
    {
        return Err(ApiError::bad("id may only contain alphanumerics, -, _"));
    }
    Ok(s.to_string())
}

fn slugify(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut prev_dash = false;
    for c in s.chars() {
        if c.is_ascii_alphanumeric() {
            out.push(c.to_ascii_lowercase());
            prev_dash = false;
        } else if !prev_dash && !out.is_empty() {
            out.push('-');
            prev_dash = true;
        }
    }
    let trimmed = out.trim_end_matches('-');
    let limited: String = trimmed.chars().take(40).collect();
    if limited.is_empty() {
        "x".into()
    } else {
        limited
    }
}

// --- error handling --------------------------------------------------------

struct ApiError {
    status: StatusCode,
    message: String,
}

impl ApiError {
    fn internal(m: impl Into<String>) -> Self {
        Self {
            status: StatusCode::INTERNAL_SERVER_ERROR,
            message: m.into(),
        }
    }
    fn bad(m: impl Into<String>) -> Self {
        Self {
            status: StatusCode::BAD_REQUEST,
            message: m.into(),
        }
    }
    fn forbidden(m: impl Into<String>) -> Self {
        Self {
            status: StatusCode::FORBIDDEN,
            message: m.into(),
        }
    }
    fn not_found(m: impl Into<String>) -> Self {
        Self {
            status: StatusCode::NOT_FOUND,
            message: m.into(),
        }
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let body = Json(serde_json::json!({ "error": self.message }));
        (self.status, body).into_response()
    }
}

// --- server lifecycle ------------------------------------------------------

struct RunningServer {
    addr: SocketAddr,
    shutdown_tx: oneshot::Sender<()>,
}

#[derive(Default)]
pub struct ServerState {
    inner: Arc<Mutex<Option<RunningServer>>>,
}

#[derive(Serialize, Clone)]
pub struct ServerStatus {
    pub running: bool,
    pub address: Option<String>,
}

fn make_router(state: AppState) -> Router {
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);
    Router::new()
        .route("/api/ping", get(ping))
        .route("/api/quizzes", get(list_quizzes))
        .route("/api/quizzes/:id", get(get_quiz))
        .route("/api/submissions", post(post_submission).get(list_submissions))
        .with_state(state)
        .layer(cors)
}

#[tauri::command]
pub async fn start_teaching_server(
    bind_address: String,
    port: u16,
    state: tauri::State<'_, ServerState>,
) -> Result<ServerStatus, String> {
    {
        let guard = state.inner.lock().unwrap();
        if guard.is_some() {
            return Err("teaching server already running".into());
        }
    }
    let notebooks_dir = teachbook_subdir("notebooks")?;
    let submissions_dir = teachbook_subdir("submissions")?;
    let app_state = AppState {
        notebooks_dir,
        submissions_dir,
    };
    let addr: SocketAddr = format!("{}:{}", bind_address, port)
        .parse()
        .map_err(|e| format!("invalid bind address: {e}"))?;
    let listener = TcpListener::bind(addr)
        .await
        .map_err(|e| format!("bind {addr}: {e}"))?;
    let actual_addr = listener
        .local_addr()
        .map_err(|e| format!("local_addr: {e}"))?;
    let router = make_router(app_state);

    let (tx, rx) = oneshot::channel::<()>();
    let server_task = async move {
        let _ = axum::serve(listener, router)
            .with_graceful_shutdown(async {
                let _ = rx.await;
            })
            .await;
    };
    tokio::spawn(server_task);
    {
        let mut guard = state.inner.lock().unwrap();
        *guard = Some(RunningServer {
            addr: actual_addr,
            shutdown_tx: tx,
        });
    }
    Ok(ServerStatus {
        running: true,
        address: Some(actual_addr.to_string()),
    })
}

#[tauri::command]
pub fn stop_teaching_server(state: tauri::State<'_, ServerState>) -> Result<(), String> {
    let mut guard = state.inner.lock().unwrap();
    if let Some(server) = guard.take() {
        let _ = server.shutdown_tx.send(());
    }
    Ok(())
}

#[tauri::command]
pub fn teaching_server_status(state: tauri::State<'_, ServerState>) -> ServerStatus {
    let guard = state.inner.lock().unwrap();
    match guard.as_ref() {
        Some(s) => ServerStatus {
            running: true,
            address: Some(s.addr.to_string()),
        },
        None => ServerStatus {
            running: false,
            address: None,
        },
    }
}
