//! Staying current.
//!
//! The CLI normally lives *inside* Tandem.app, where it isn't its own
//! installable thing — updating the app updates it. So this doesn't
//! try to replace a binary it doesn't own: it works out how this copy
//! got here and does the right thing for that, which is sometimes
//! "tell you to press the button in the app".

use std::path::{Path, PathBuf};
use std::time::Duration;

use serde_json::Value;

/// Published by every release; the updater reads the same file.
const LATEST_JSON: &str =
    "https://github.com/matthewmyrick/code-review/releases/latest/download/latest.json";
const ASSET_BASE: &str = "https://github.com/matthewmyrick/code-review/releases/latest/download";

const TIMEOUT: Duration = Duration::from_secs(30);

/// The asset this build would replace itself with.
const ASSET: &str = if cfg!(all(target_os = "macos", target_arch = "aarch64")) {
    "tandem-cli-macos-arm64"
} else if cfg!(target_os = "macos") {
    "tandem-cli-macos-x64"
} else if cfg!(target_os = "windows") {
    "tandem-cli-windows-x64.exe"
} else {
    "tandem-cli-linux-x86_64"
};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Install {
    /// Inside Tandem.app, linked onto PATH by Homebrew.
    BrewApp,
    /// Inside Tandem.app, installed some other way.
    App,
    /// A standalone binary someone downloaded.
    Standalone,
}

fn in_app_bundle(exe: &Path) -> bool {
    exe.to_string_lossy().contains(".app/Contents/MacOS/")
}

fn brew_manages_tandem() -> bool {
    std::process::Command::new("brew")
        .args(["list", "--cask", "tandem"])
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

pub fn detect(exe: &Path) -> Install {
    if !in_app_bundle(exe) {
        return Install::Standalone;
    }
    if brew_manages_tandem() {
        Install::BrewApp
    } else {
        Install::App
    }
}

fn latest_version() -> Result<String, String> {
    let client = reqwest::blocking::Client::builder()
        .timeout(TIMEOUT)
        .user_agent(concat!("tandem-cli/", env!("CARGO_PKG_VERSION")))
        .build()
        .map_err(|e| e.to_string())?;
    let body: Value = client
        .get(LATEST_JSON)
        .send()
        .map_err(|e| format!("couldn't reach GitHub: {e}"))?
        .error_for_status()
        .map_err(|e| e.to_string())?
        .json()
        .map_err(|e| format!("latest.json wasn't JSON: {e}"))?;
    body.get("version")
        .and_then(Value::as_str)
        .map(str::to_owned)
        .ok_or_else(|| "latest.json has no version".to_owned())
}

/// True when `latest` is newer. Falls back to "different means newer"
/// if either side isn't three numbers, which beats claiming you're
/// current when we can't tell.
fn behind(current: &str, latest: &str) -> bool {
    let parse = |v: &str| -> Option<(u64, u64, u64)> {
        let mut it = v.split('.').map(str::parse::<u64>);
        match (it.next(), it.next(), it.next()) {
            (Some(Ok(a)), Some(Ok(b)), Some(Ok(c))) => Some((a, b, c)),
            _ => None,
        }
    };
    match (parse(current), parse(latest)) {
        (Some(a), Some(b)) => b > a,
        _ => current != latest,
    }
}

fn status(exe: &Path) -> Result<(String, String, bool, Install), String> {
    let current = env!("CARGO_PKG_VERSION").to_owned();
    let latest = latest_version()?;
    let is_behind = behind(&current, &latest);
    Ok((current, latest, is_behind, detect(exe)))
}

pub fn check() -> Result<Value, String> {
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let (current, latest, is_behind, how) = status(&exe)?;
    Ok(serde_json::json!({
        "current": current,
        "latest": latest,
        "behind": is_behind,
        "installed_as": label(how),
        "path": exe,
    }))
}

fn label(how: Install) -> &'static str {
    match how {
        Install::BrewApp => "inside Tandem.app (homebrew)",
        Install::App => "inside Tandem.app",
        Install::Standalone => "standalone binary",
    }
}

pub fn perform() -> Result<Value, String> {
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let (current, latest, is_behind, how) = status(&exe)?;
    if !is_behind {
        return Ok(serde_json::json!({
            "updated": false,
            "current": current,
            "latest": latest,
            "note": "already current",
        }));
    }

    let done = match how {
        // The CLI is part of the app here, so updating it means
        // updating the app — and brew is the thing that owns that.
        Install::BrewApp => {
            let out = std::process::Command::new("brew")
                .args(["upgrade", "--cask", "tandem"])
                .output()
                .map_err(|e| format!("couldn't run brew: {e}"))?;
            if !out.status.success() {
                return Err(format!(
                    "brew upgrade failed: {}",
                    String::from_utf8_lossy(&out.stderr).trim()
                ));
            }
            serde_json::json!({ "updated": true, "via": "brew upgrade --cask tandem" })
        }
        // Replacing an app bundle out from under a running app is the
        // app's own job, and it has an updater for it.
        Install::App => serde_json::json!({
            "updated": false,
            "via": "in-app updater",
            "note": "this CLI ships inside Tandem.app — update the app and the CLI comes with it",
        }),
        Install::Standalone => {
            replace_self(&exe)?;
            serde_json::json!({ "updated": true, "via": ASSET, "path": exe })
        }
    };

    let mut value = done;
    value["current"] = Value::String(current);
    value["latest"] = Value::String(latest);
    Ok(value)
}

/// Download the new binary beside this one and rename over it. On Unix
/// a running program keeps its open inode, so this is safe mid-run;
/// Windows locks the file, so it gets told rather than broken.
fn replace_self(exe: &Path) -> Result<(), String> {
    if cfg!(target_os = "windows") {
        return Err(
            "Windows can't replace a running binary — download the new tandic-cli manually".into(),
        );
    }
    let client = reqwest::blocking::Client::builder()
        .timeout(TIMEOUT)
        .user_agent(concat!("tandem-cli/", env!("CARGO_PKG_VERSION")))
        .build()
        .map_err(|e| e.to_string())?;
    let bytes = client
        .get(format!("{ASSET_BASE}/{ASSET}"))
        .send()
        .map_err(|e| format!("couldn't download {ASSET}: {e}"))?
        .error_for_status()
        .map_err(|e| e.to_string())?
        .bytes()
        .map_err(|e| e.to_string())?;

    // Beside the target, so the rename stays on one filesystem.
    let staged: PathBuf = exe.with_extension("new");
    std::fs::write(&staged, &bytes)
        .map_err(|e| format!("can't write {}: {e}", staged.display()))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&staged, std::fs::Permissions::from_mode(0o755))
            .map_err(|e| e.to_string())?;
    }
    std::fs::rename(&staged, exe).map_err(|e| format!("can't replace {}: {e}", exe.display()))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn newer_versions_count_as_behind() {
        assert!(behind("0.2.28", "0.3.0"));
        assert!(behind("0.2.9", "0.2.10"));
        assert!(!behind("0.3.0", "0.3.0"));
        assert!(!behind("0.3.1", "0.3.0"));
    }

    #[test]
    fn unparseable_versions_err_towards_telling_you() {
        // The placeholder a pre-stamp build carries: we can't compare,
        // so say "behind" rather than "current".
        assert!(behind("dev", "0.3.0"));
        assert!(!behind("same", "same"));
    }

    #[test]
    fn a_bundled_path_is_not_standalone() {
        assert_eq!(
            detect(Path::new("/some/where/tandem-cli")),
            Install::Standalone
        );
        assert!(in_app_bundle(Path::new(
            "/Applications/Tandem.app/Contents/MacOS/tandem-cli"
        )));
    }
}
