mod claude;
mod examples;
mod library;
mod settings;
mod teaching_server;

use std::fs;
use std::path::PathBuf;

use claude::{claude_cancel, claude_check, claude_prompt, claude_prompt_stream, ClaudeState};
use examples::list_bundled_notebooks;
use library::{
    list_user_notebooks, user_experiments_path, user_notebooks_path, user_progress_path,
};
use settings::{get_settings, set_settings};
use teaching_server::{
    start_teaching_server, stop_teaching_server, teaching_server_status, ServerState,
};

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
        .manage(ClaudeState::default())
        .manage(ServerState::default())
        .invoke_handler(tauri::generate_handler![
            load_notebook,
            save_notebook,
            app_version,
            claude_check,
            claude_prompt,
            claude_prompt_stream,
            claude_cancel,
            list_bundled_notebooks,
            list_user_notebooks,
            user_notebooks_path,
            user_experiments_path,
            user_progress_path,
            get_settings,
            set_settings,
            start_teaching_server,
            stop_teaching_server,
            teaching_server_status
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
