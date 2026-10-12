use crate::managers::statistics::{StatisticsManager, UsageStatistics};
use std::sync::Arc;
use tauri::{AppHandle, Manager};

/// Snapshot waits for prior queued records on a blocking worker, never on the
/// UI thread. Initialization failure must be an explicit error, not a panic.
#[tauri::command]
#[specta::specta]
pub async fn get_usage_statistics(app: AppHandle) -> Result<UsageStatistics, String> {
    let statistics = app
        .try_state::<Arc<StatisticsManager>>()
        .map(|state| Arc::clone(state.inner()))
        .ok_or_else(|| "Usage statistics are unavailable: initialization failed".to_string())?;

    tokio::task::spawn_blocking(move || statistics.snapshot())
        .await
        .map_err(|error| format!("Usage statistics task failed: {error}"))?
}
