//! Schema migrations. Append new statements to `MIGRATIONS`; never edit
//! an entry that has shipped.

use rusqlite::Connection;
use tandem_core::{Result, TandemError};

pub const MIGRATIONS: &[&str] = &[
    // 001: initial schema
    "
    CREATE TABLE meta (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
    );
    CREATE TABLE pull_requests (
        repo       TEXT NOT NULL,
        number     INTEGER NOT NULL,
        updated_at TEXT NOT NULL,
        json       TEXT NOT NULL,
        PRIMARY KEY (repo, number)
    );
    CREATE TABLE pr_details (
        repo       TEXT NOT NULL,
        number     INTEGER NOT NULL,
        fetched_at TEXT NOT NULL,
        json       TEXT NOT NULL,
        PRIMARY KEY (repo, number)
    );
    CREATE TABLE diffs (
        repo       TEXT NOT NULL,
        number     INTEGER NOT NULL,
        head_sha   TEXT NOT NULL,
        fetched_at TEXT NOT NULL,
        raw        TEXT NOT NULL,
        json       TEXT NOT NULL,
        PRIMARY KEY (repo, number, head_sha)
    );
    CREATE TABLE local_comments (
        id         TEXT PRIMARY KEY,
        repo       TEXT NOT NULL,
        pr_number  INTEGER NOT NULL,
        updated_at TEXT NOT NULL,
        json       TEXT NOT NULL
    );
    CREATE INDEX idx_local_comments_pr ON local_comments (repo, pr_number);
    CREATE TABLE agent_specs (
        name TEXT PRIMARY KEY,
        json TEXT NOT NULL
    );
    CREATE TABLE agent_runs (
        run_id     TEXT PRIMARY KEY,
        repo       TEXT NOT NULL,
        pr_number  INTEGER NOT NULL,
        started_at TEXT NOT NULL,
        json       TEXT NOT NULL
    );
    CREATE INDEX idx_agent_runs_pr ON agent_runs (repo, pr_number);
    ",
    // 002: merged-PR archive (3-day retention before purge)
    "
    CREATE TABLE archived_prs (
        repo        TEXT NOT NULL,
        number      INTEGER NOT NULL,
        archived_at TEXT NOT NULL,
        purge_after TEXT NOT NULL,
        json        TEXT NOT NULL,
        PRIMARY KEY (repo, number)
    );
    ",
];

/// Run any migrations newer than the connection's `user_version`.
pub fn migrate(conn: &Connection) -> Result<()> {
    let applied: i64 = conn
        .query_row("PRAGMA user_version", [], |row| row.get(0))
        .map_err(cache_err)?;
    let applied = usize::try_from(applied).unwrap_or(0);

    for (idx, sql) in MIGRATIONS.iter().enumerate().skip(applied) {
        conn.execute_batch(sql).map_err(cache_err)?;
        // PRAGMA doesn't support parameter binding; idx comes from
        // enumerate() so the interpolation is safe.
        conn.pragma_update(None, "user_version", idx as i64 + 1)
            .map_err(cache_err)?;
        tracing::info!(migration = idx + 1, "applied cache migration");
    }
    Ok(())
}

pub fn cache_err(e: rusqlite::Error) -> TandemError {
    TandemError::Cache(e.to_string())
}
