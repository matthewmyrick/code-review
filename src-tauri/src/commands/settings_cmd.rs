//! Settings commands.

use tandem_core::TandemError;
use tauri::State;

use crate::settings::Settings;
use crate::state::AppState;

#[tauri::command]
pub async fn get_settings(state: State<'_, AppState>) -> Result<Settings, TandemError> {
    Ok(state.settings.lock().await.clone())
}

#[tauri::command]
pub async fn update_settings(
    state: State<'_, AppState>,
    settings: Settings,
) -> Result<Settings, TandemError> {
    settings.save(&state.dirs.settings_file)?;
    let mut current = state.settings.lock().await;
    *current = settings;
    Ok(current.clone())
}
