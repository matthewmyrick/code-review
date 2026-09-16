//! Shared application state managed by Tauri.

use std::collections::HashMap;
use tandem_cache::Cache;
use tandem_core::Result;
use tandem_github::{GithubClient, GithubConfig};
use tokio::sync::Mutex;

use crate::settings::{AppDirs, Settings};

pub struct AppState {
    pub dirs: AppDirs,
    pub cache: Mutex<Cache>,
    pub settings: Mutex<Settings>,
    /// Cancel handles for in-flight agent runs, keyed by run id.
    pub runs: Mutex<HashMap<String, tandem_agents::runner::CancelHandle>>,
}

impl std::fmt::Debug for AppState {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("AppState")
            .field("dirs", &self.dirs)
            .finish_non_exhaustive()
    }
}

impl AppState {
    pub fn init() -> Result<Self> {
        let dirs = AppDirs::resolve()?;
        let cache = Cache::open(&dirs.cache_db)?;
        let settings = Settings::load(&dirs.settings_file)?;
        Ok(Self {
            dirs,
            cache: Mutex::new(cache),
            settings: Mutex::new(settings),
            runs: Mutex::new(HashMap::new()),
        })
    }

    /// Snapshot the GitHub config (cheap clone) for building a client.
    pub async fn github_config(&self) -> GithubConfig {
        self.settings.lock().await.github.clone()
    }

    pub async fn github_client(&self) -> Result<GithubClient> {
        GithubClient::connect(&self.github_config().await).await
    }
}
