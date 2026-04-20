use serde::Serialize;
use std::fs;
use std::path::PathBuf;

#[derive(Serialize)]
pub struct UserNotebook {
    pub filename: String,
    pub path: String,
    pub content: String,
}

/// ~/Teachbook/notebooks — cross-platform. Created on demand.
fn user_notebooks_dir() -> Result<PathBuf, String> {
    let home = dirs::home_dir().ok_or_else(|| "Could not resolve $HOME".to_string())?;
    let dir = home.join("Teachbook").join("notebooks");
    if !dir.exists() {
        fs::create_dir_all(&dir)
            .map_err(|e| format!("Failed to create {}: {e}", dir.display()))?;
    }
    Ok(dir)
}

#[tauri::command]
pub fn user_notebooks_path() -> Result<String, String> {
    user_notebooks_dir().map(|p| p.to_string_lossy().to_string())
}

#[tauri::command]
pub fn list_user_notebooks() -> Result<Vec<UserNotebook>, String> {
    let dir = user_notebooks_dir()?;
    let mut entries: Vec<UserNotebook> = Vec::new();

    let read = fs::read_dir(&dir)
        .map_err(|e| format!("Failed to read {}: {e}", dir.display()))?;

    for entry in read.flatten() {
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
        let filename = path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("")
            .to_string();
        let content = match fs::read_to_string(&path) {
            Ok(c) => c,
            Err(_) => continue, // skip unreadable files silently
        };
        entries.push(UserNotebook {
            filename,
            path: path.to_string_lossy().to_string(),
            content,
        });
    }

    entries.sort_by(|a, b| a.filename.to_lowercase().cmp(&b.filename.to_lowercase()));
    Ok(entries)
}
