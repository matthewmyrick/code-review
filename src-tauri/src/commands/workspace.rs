//! "Open in editor": resolve (or create) a local working tree for a PR
//! and launch the user's editor on it.
//!
//! User-configured checkouts are NEVER mutated — no fetch, no branch
//! switch. Only Tandem-managed clones (under the app data dir) get the
//! PR branch checked out, via `gh pr checkout`.

use tandem_core::spawn::augmented_path;
use tandem_core::TandemError;
use tauri::State;

use crate::commands::parse_repo;
use crate::state::AppState;

#[derive(Debug, serde::Serialize)]
pub struct WorkspaceInfo {
    /// Where "open in editor" would land for this repo.
    pub path: String,
    /// True when the path is a Tandem-managed clone (safe to check out).
    pub managed: bool,
    /// False when the managed clone hasn't been created yet.
    pub exists: bool,
}

/// Expand a leading `~/` so settings can hold human-friendly paths.
fn expand_home(path: &str) -> String {
    match (path.strip_prefix("~/"), std::env::var("HOME")) {
        (Some(rest), Ok(home)) => format!("{home}/{rest}"),
        _ => path.to_owned(),
    }
}

fn resolve(state: &AppState, slug: &str, configured: Option<&str>) -> WorkspaceInfo {
    if let Some(path) = configured.map(expand_home) {
        if std::path::Path::new(&path).is_dir() {
            return WorkspaceInfo {
                path,
                managed: false,
                exists: true,
            };
        }
    }
    let managed = state.dirs.worktrees_dir.join(slug);
    WorkspaceInfo {
        exists: managed.is_dir(),
        path: managed.to_string_lossy().into_owned(),
        managed: true,
    }
}

/// Where "open in editor" would open this repo (for display).
#[tauri::command]
pub async fn resolve_workspace(
    state: State<'_, AppState>,
    repo: String,
) -> Result<WorkspaceInfo, TandemError> {
    let repo = parse_repo(&repo)?;
    let configured = {
        let settings = state.settings.lock().await;
        settings.repo_paths.get(&repo.slug()).cloned()
    };
    Ok(resolve(&state, &repo.slug(), configured.as_deref()))
}

async fn run_gh(args: &[&str], dir: Option<&std::path::Path>) -> Result<(), TandemError> {
    let mut cmd = tokio::process::Command::new("gh");
    cmd.env("PATH", augmented_path()).args(args);
    if let Some(dir) = dir {
        cmd.current_dir(dir);
    }
    let output = cmd
        .output()
        .await
        .map_err(|e| TandemError::Config(format!("failed to run gh: {e}")))?;
    if !output.status.success() {
        return Err(TandemError::Config(format!(
            "`gh {}` failed: {}",
            args.join(" "),
            String::from_utf8_lossy(&output.stderr).trim()
        )));
    }
    Ok(())
}

/// Open the PR's working tree in the configured editor, creating a
/// managed partial clone first when no checkout is known. Returns the
/// path that was opened.
#[tauri::command]
pub async fn open_in_editor(
    state: State<'_, AppState>,
    repo: String,
    number: u64,
) -> Result<String, TandemError> {
    let repo = parse_repo(&repo)?;
    let slug = repo.slug();
    let (editor, configured) = {
        let settings = state.settings.lock().await;
        (
            settings.editor_command.clone(),
            settings.repo_paths.get(&slug).cloned(),
        )
    };
    let editor = if editor.trim().is_empty() {
        "code".to_owned()
    } else {
        editor
    };

    let info = resolve(&state, &slug, configured.as_deref());
    let path = std::path::PathBuf::from(&info.path);

    if info.managed {
        if !info.exists {
            if let Some(parent) = path.parent() {
                std::fs::create_dir_all(parent)?;
            }
            // Blobless partial clone: fast even on large repos; gh
            // reuses the user's existing auth.
            run_gh(
                &[
                    "repo",
                    "clone",
                    &slug,
                    &info.path,
                    "--",
                    "--filter=blob:none",
                ],
                None,
            )
            .await?;
        }
        // Managed clones follow the PR; user checkouts are left alone.
        // Best-effort: a dirty tree from earlier edits shouldn't block
        // opening the editor.
        if let Err(e) = run_gh(&["pr", "checkout", &number.to_string()], Some(&path)).await {
            tracing::warn!(error = %e, "gh pr checkout failed — opening editor anyway");
        }
    }

    // Launch detached through a shell so commands with flags work
    // ("code -n", "subl -w", ...). Terminal editors like nvim need a
    // wrapper that opens a terminal — documented in settings.
    let quoted = info.path.replace('\'', r"'\''");
    tokio::process::Command::new("/bin/sh")
        .env("PATH", augmented_path())
        .args(["-lc", &format!("{editor} '{quoted}'")])
        .current_dir(&path)
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .spawn()
        .map_err(|e| TandemError::Config(format!("couldn't launch editor `{editor}`: {e}")))?;

    Ok(info.path)
}
