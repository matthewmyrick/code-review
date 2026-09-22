//! Child-process environment helpers.
//!
//! A packaged macOS app launched from Finder inherits the minimal system
//! PATH (`/usr/bin:/bin:...`) — Homebrew and user-local tools like `gh`,
//! `claude`, `codex`, and `grok` are invisible to it, which breaks every
//! spawn that works fine in `tauri dev`. Prepending the standard install
//! locations fixes the packaged app without affecting dev mode.

/// The current PATH with common tool locations prepended (deduplicated).
pub fn augmented_path() -> String {
    let current = std::env::var("PATH").unwrap_or_default();
    let home = std::env::var("HOME").unwrap_or_default();
    let extras = [
        "/opt/homebrew/bin".to_owned(),
        "/usr/local/bin".to_owned(),
        format!("{home}/.local/bin"),
        format!("{home}/bin"),
    ];
    let mut parts: Vec<String> = Vec::new();
    for p in extras
        .into_iter()
        .chain(current.split(':').map(str::to_owned))
    {
        if !p.is_empty() && !parts.contains(&p) {
            parts.push(p);
        }
    }
    parts.join(":")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn prepends_homebrew_and_dedupes() {
        let path = augmented_path();
        assert!(path.starts_with("/opt/homebrew/bin"));
        assert_eq!(path.matches("/opt/homebrew/bin").count(), 1);
    }
}
