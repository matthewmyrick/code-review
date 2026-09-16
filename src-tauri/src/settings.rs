//! User settings, persisted as JSON in the platform config directory.
//!
//! NOTE: a PAT configured via `GithubAuth::Token` currently lives in this
//! file (created with 0600 perms). Moving secrets to the OS keychain is
//! on the roadmap (docs/ROADMAP.md).

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use tandem_core::{Result, TandemError};
use tandem_github::GithubConfig;

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct Settings {
    pub github: GithubConfig,
    /// Repositories to track, as `owner/name` slugs.
    pub repos: Vec<String>,
    /// Default PR-list filters, applied whenever a repo is opened; the
    /// user can adjust or clear them at runtime without saving.
    pub pr_filters: PrFilters,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default)]
pub struct PrFilters {
    pub query: String,
    pub author: String,
    pub label: String,
    #[serde(default = "default_true")]
    pub hide_drafts: bool,
}

fn default_true() -> bool {
    true
}

impl Default for PrFilters {
    fn default() -> Self {
        Self {
            query: String::new(),
            author: String::new(),
            label: String::new(),
            // Drafts are noise for most review flows — hide by default.
            hide_drafts: true,
        }
    }
}

/// Where Tandem keeps its files on disk.
#[derive(Debug, Clone)]
pub struct AppDirs {
    pub settings_file: PathBuf,
    pub cache_db: PathBuf,
    pub runs_dir: PathBuf,
}

impl AppDirs {
    pub fn resolve() -> Result<Self> {
        let config_root = dirs::config_dir()
            .ok_or_else(|| TandemError::Config("no config directory on this platform".into()))?;
        let data_root = dirs::data_dir()
            .ok_or_else(|| TandemError::Config("no data directory on this platform".into()))?;
        // The app used to be called "appa" — carry existing data across.
        migrate_legacy_dir(&config_root.join("appa"), &config_root.join("tandem"));
        migrate_legacy_dir(&data_root.join("appa"), &data_root.join("tandem"));

        let config = config_root.join("tandem");
        let data = data_root.join("tandem");
        Ok(Self {
            settings_file: config.join("settings.json"),
            cache_db: data.join("cache.sqlite3"),
            runs_dir: data.join("runs"),
        })
    }
}

/// Best-effort one-time rename of a pre-rename data directory.
fn migrate_legacy_dir(old: &Path, new: &Path) {
    if old.is_dir() && !new.exists() {
        match std::fs::rename(old, new) {
            Ok(()) => {
                tracing::info!(from = %old.display(), to = %new.display(), "migrated data dir")
            }
            Err(e) => tracing::warn!(error = %e, "failed to migrate legacy data dir"),
        }
    }
}

impl Settings {
    pub fn load(path: &Path) -> Result<Self> {
        match std::fs::read_to_string(path) {
            Ok(contents) => Ok(serde_json::from_str(&contents)?),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(Self::default()),
            Err(e) => Err(e.into()),
        }
    }

    pub fn save(&self, path: &Path) -> Result<()> {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let json = serde_json::to_string_pretty(self)?;
        std::fs::write(path, json)?;
        restrict_permissions(path)?;
        Ok(())
    }
}

#[cfg(unix)]
fn restrict_permissions(path: &Path) -> Result<()> {
    use std::os::unix::fs::PermissionsExt;
    let perms = std::fs::Permissions::from_mode(0o600);
    std::fs::set_permissions(path, perms)?;
    Ok(())
}

#[cfg(not(unix))]
fn restrict_permissions(_path: &Path) -> Result<()> {
    Ok(())
}

#[cfg(test)]
#[allow(clippy::unwrap_used)]
mod tests {
    use super::*;

    #[test]
    fn roundtrips_settings() {
        let dir = std::env::temp_dir().join(format!("tandem-settings-{}", std::process::id()));
        let path = dir.join("settings.json");
        let mut s = Settings::default();
        s.repos.push("matthewmyrick/code-review".into());
        s.save(&path).unwrap();
        let loaded = Settings::load(&path).unwrap();
        assert_eq!(loaded.repos, s.repos);
        std::fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn missing_file_yields_defaults() {
        let loaded = Settings::load(Path::new("/nonexistent/tandem/settings.json")).unwrap();
        assert!(loaded.repos.is_empty());
    }
}
