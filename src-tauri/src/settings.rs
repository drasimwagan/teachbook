//! Persisted settings. Lives at `~/Teachbook/settings.json` and is a flat
//! JSON document so users can edit it by hand if needed.
//!
//! Design note: kept intentionally small. Everything a feature needs
//! should be explicit; we avoid nested config bags that drift.

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

/// Teaching-server configuration. When `enabled`, the Rust side starts an
/// axum HTTP server on `port` / `bind_address` that serves locked notebooks
/// and accepts student submissions.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TeachingServerConfig {
    pub enabled: bool,
    pub port: u16,
    /// "0.0.0.0" to listen on all interfaces (LAN-accessible), or
    /// "127.0.0.1" for loopback-only (testing).
    pub bind_address: String,
}

impl Default for TeachingServerConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            port: 7480,
            bind_address: "0.0.0.0".to_string(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(default)]
pub struct Settings {
    /// Set on the teacher's machine to publish locked notebooks over HTTP.
    pub teaching_server: TeachingServerConfig,
    /// Set on the student's machine. Absolute URL of the teacher's
    /// teaching server, e.g. "http://192.168.1.10:7480".
    pub teacher_url: Option<String>,
    /// Free-form identifier the student includes in submissions. Not a
    /// login — just a name field. No auth claim.
    pub student_name: Option<String>,
    /// Optional student ID (e.g. a university or classroom roster id).
    /// Kept separate from `student_name` so teachers can disambiguate
    /// duplicate names.
    pub student_id: Option<String>,
}

fn settings_path() -> Result<PathBuf, String> {
    let home = dirs::home_dir().ok_or_else(|| "Could not resolve $HOME".to_string())?;
    let dir = home.join("Teachbook");
    if !dir.exists() {
        fs::create_dir_all(&dir)
            .map_err(|e| format!("Failed to create {}: {e}", dir.display()))?;
    }
    Ok(dir.join("settings.json"))
}

pub fn load_settings() -> Result<Settings, String> {
    let path = settings_path()?;
    if !path.exists() {
        return Ok(Settings::default());
    }
    let raw = fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read {}: {e}", path.display()))?;
    serde_json::from_str(&raw)
        .map_err(|e| format!("Invalid settings JSON at {}: {e}", path.display()))
}

pub fn save_settings(s: &Settings) -> Result<(), String> {
    let path = settings_path()?;
    let raw = serde_json::to_string_pretty(s)
        .map_err(|e| format!("serialize settings: {e}"))?;
    fs::write(&path, raw)
        .map_err(|e| format!("Failed to write {}: {e}", path.display()))
}

#[tauri::command]
pub fn get_settings() -> Result<Settings, String> {
    load_settings()
}

#[tauri::command]
pub fn set_settings(settings: Settings) -> Result<(), String> {
    save_settings(&settings)
}
