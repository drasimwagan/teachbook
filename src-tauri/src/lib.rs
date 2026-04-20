mod claude;

use std::fs;
use std::path::PathBuf;

use claude::{claude_check, claude_generate_notebook, claude_prompt, claude_prompt_stream};

#[tauri::command]
fn load_notebook(path: String) -> Result<String, String> {
    fs::read_to_string(PathBuf::from(&path))
        .map_err(|e| format!("failed to read {path}: {e}"))
}

#[tauri::command]
fn save_notebook(path: String, contents: String) -> Result<(), String> {
    fs::write(PathBuf::from(&path), contents)
        .map_err(|e| format!("failed to write {path}: {e}"))
}

#[tauri::command]
fn app_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            load_notebook,
            save_notebook,
            app_version,
            claude_check,
            claude_prompt,
            claude_prompt_stream,
            claude_generate_notebook
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
