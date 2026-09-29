//! User settings, persisted as JSON in the platform config directory.
//!
//! NOTE: a PAT configured via `GithubAuth::Token` currently lives in this
//! file (created with 0600 perms). Moving secrets to the OS keychain is
//! on the roadmap (docs/ROADMAP.md).

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use tandem_core::{Result, TandemError};
use tandem_github::GithubConfig;

/// Bump when a migration in [`Settings::load`] needs to run once.
const SETTINGS_VERSION: u32 = 3;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct Settings {
    pub github: GithubConfig,
    /// Owners (orgs, or your own GitHub login) tracked for the repo
    /// picker. The repo list itself is fetched live from GitHub, never
    /// stored here.
    pub orgs: Vec<String>,
    /// Repo shown on a fresh, uncached launch (`owner/name`); `None`
    /// falls back to the repo picker.
    pub default_repo: Option<String>,
    /// Default PR-list filters, applied whenever a repo is opened; the
    /// user can adjust or clear them at runtime without saving.
    pub pr_filters: PrFilters,
    /// Default ordering for PR lists ("opened-asc", "updated-desc", ...).
    #[serde(default = "default_pr_sort")]
    pub pr_sort: String,
    /// Whether inbox tabs search every repo instead of the selected one.
    pub inbox_all_repos: bool,
    /// Command "open in editor" runs on a working tree — e.g. "code",
    /// "cursor", "zed", "subl". Terminal editors need a wrapper.
    #[serde(default = "default_editor_command")]
    pub editor_command: String,
    /// Known local checkouts, repo slug -> absolute path. Used before
    /// falling back to a Tandem-managed clone (which is never the case
    /// for these paths: user checkouts are never mutated).
    #[serde(default)]
    pub repo_paths: std::collections::BTreeMap<String, String>,
    /// Settings schema version (for one-time migrations on load).
    pub version: u32,
}

fn default_pr_sort() -> String {
    "opened-desc".to_owned()
}

fn default_editor_command() -> String {
    "code".to_owned()
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            github: GithubConfig::default(),
            orgs: Vec::new(),
            default_repo: None,
            pr_filters: PrFilters::default(),
            pr_sort: default_pr_sort(),
            inbox_all_repos: false,
            editor_command: default_editor_command(),
            repo_paths: std::collections::BTreeMap::new(),
            version: SETTINGS_VERSION,
        }
    }
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
    pub worktrees_dir: PathBuf,
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
            worktrees_dir: data.join("worktrees"),
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
            Ok(contents) => {
                let raw: serde_json::Value = serde_json::from_str(&contents)?;
                // Captured before typed deserialization drops it: `repos`
                // no longer exists on `Settings` as of v3.
                let legacy_repos: Vec<String> = raw
                    .get("repos")
                    .and_then(|v| v.as_array())
                    .map(|arr| {
                        arr.iter()
                            .filter_map(|v| v.as_str().map(str::to_owned))
                            .collect()
                    })
                    .unwrap_or_default();
                let mut settings: Self = serde_json::from_value(raw)?;
                // v0 -> v1: files saved before the filters UI existed may
                // carry an unintended hide_drafts=false — restore the
                // intended default exactly once.
                if settings.version < 1 {
                    settings.pr_filters.hide_drafts = true;
                }
                // v1 -> v2: the default ordering changed to newest-opened;
                // carry files that still hold the old default across.
                if settings.version < 2 && settings.pr_sort == "opened-asc" {
                    settings.pr_sort = "opened-desc".to_owned();
                }
                // v2 -> v3: the flat tracked-repo list (`repos`) was
                // replaced by tracked owners (`orgs`) + an explicit
                // `default_repo`. Derive both from the old list so
                // existing setups don't need to reconfigure anything.
                if settings.version < 3 {
                    for slug in &legacy_repos {
                        if let Some(owner) = slug.split('/').next() {
                            if !settings.orgs.iter().any(|o| o == owner) {
                                settings.orgs.push(owner.to_owned());
                            }
                        }
                    }
                    if settings.default_repo.is_none() {
                        settings.default_repo = legacy_repos.first().cloned();
                    }
                }
                if settings.version < SETTINGS_VERSION {
                    settings.version = SETTINGS_VERSION;
                }
                Ok(settings)
            }
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
        s.orgs.push("matthewmyrick".into());
        s.default_repo = Some("matthewmyrick/code-review".into());
        s.save(&path).unwrap();
        let loaded = Settings::load(&path).unwrap();
        assert_eq!(loaded.orgs, s.orgs);
        assert_eq!(loaded.default_repo, s.default_repo);
        std::fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn missing_file_yields_defaults() {
        let loaded = Settings::load(Path::new("/nonexistent/tandem/settings.json")).unwrap();
        assert!(loaded.orgs.is_empty());
        assert!(loaded.default_repo.is_none());
    }

    #[test]
    fn migrates_legacy_repos_to_orgs_and_default_repo() {
        let dir =
            std::env::temp_dir().join(format!("tandem-settings-migrate-{}", std::process::id()));
        let path = dir.join("settings.json");
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(
            &path,
            r#"{"version":2,"repos":["matthewmyrick/code-review","matthewmyrick/dotfiles","other-org/thing"]}"#,
        )
        .unwrap();
        let loaded = Settings::load(&path).unwrap();
        assert_eq!(loaded.orgs, vec!["matthewmyrick", "other-org"]);
        assert_eq!(
            loaded.default_repo,
            Some("matthewmyrick/code-review".to_owned())
        );
        assert_eq!(loaded.version, SETTINGS_VERSION);
        std::fs::remove_dir_all(dir).ok();
    }
}
