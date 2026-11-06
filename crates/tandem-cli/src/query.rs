//! The queries themselves. Rows are JSON blobs with indexed key
//! columns, so most of this is "select the blob, hand it back" — the
//! value is knowing which table and which key.

use std::path::Path;

use rusqlite::{Connection, Row};
use serde_json::Value;

pub fn print(value: &Value, pretty: bool) {
    let text = if pretty {
        serde_json::to_string_pretty(value)
    } else {
        serde_json::to_string(value)
    };
    match text {
        Ok(text) => println!("{text}"),
        Err(e) => eprintln!("tandem-cli: couldn't render JSON: {e}"),
    }
}

fn blob(row: &Row<'_>) -> rusqlite::Result<Value> {
    let raw: String = row.get(0)?;
    Ok(serde_json::from_str(&raw).unwrap_or(Value::Null))
}

fn collect(conn: &Connection, sql: &str, params: &[&dyn rusqlite::ToSql]) -> Result<Value, String> {
    let mut stmt = conn.prepare(sql).map_err(|e| e.to_string())?;
    let rows = stmt.query_map(params, blob).map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    for row in rows {
        out.push(row.map_err(|e| e.to_string())?);
    }
    Ok(Value::Array(out))
}

pub fn paths(db: &Path, pretty: bool) -> Result<(), String> {
    let data = db.parent().map(Path::to_path_buf).unwrap_or_default();
    let value = serde_json::json!({
        "database": db,
        "exists": db.exists(),
        "runs": data.join("runs"),
        "worktrees": data.join("worktrees"),
        // Settings live under the config dir, which is the same as the
        // data dir everywhere except Linux.
        "settings": dirs::config_dir()
            .map(|c| c.join(data.file_name().unwrap_or_default()).join("settings.json")),
    });
    print(&value, pretty);
    Ok(())
}

pub fn prs(conn: &Connection, repo: Option<&str>, limit: u32) -> Result<Value, String> {
    match repo {
        Some(repo) => collect(
            conn,
            "SELECT json FROM pull_requests WHERE repo = ?1
             ORDER BY json_extract(json, '$.updated_at') DESC LIMIT ?2",
            &[&repo, &limit],
        ),
        None => collect(
            conn,
            "SELECT json FROM pull_requests
             ORDER BY json_extract(json, '$.updated_at') DESC LIMIT ?1",
            &[&limit],
        ),
    }
}

pub fn comments(conn: &Connection, repo: &str, pr: u64, threads: bool) -> Result<Value, String> {
    let flat = collect(
        conn,
        "SELECT json FROM local_comments WHERE repo = ?1 AND pr_number = ?2
         ORDER BY json_extract(json, '$.created_at') ASC",
        &[&repo, &pr],
    )?;
    if !threads {
        return Ok(flat);
    }
    // Roots in order, each carrying its replies — the shape a reader
    // actually wants, rather than one they have to reassemble.
    let items = flat.as_array().cloned().unwrap_or_default();
    let roots: Vec<Value> = items
        .iter()
        .filter(|c| c.get("parent_id").is_none_or(Value::is_null))
        .map(|root| {
            let id = root.get("id").and_then(Value::as_str).unwrap_or_default();
            let replies: Vec<Value> = items
                .iter()
                .filter(|c| c.get("parent_id").and_then(Value::as_str) == Some(id))
                .cloned()
                .collect();
            serde_json::json!({ "root": root, "replies": replies })
        })
        .collect();
    Ok(Value::Array(roots))
}

pub fn summary(conn: &Connection, repo: &str, pr: u64) -> Result<Value, String> {
    let rows = collect(
        conn,
        "SELECT json FROM pr_summaries WHERE repo = ?1 AND number = ?2",
        &[&repo, &pr],
    )?;
    Ok(rows
        .as_array()
        .and_then(|r| r.first())
        .cloned()
        .unwrap_or(Value::Null))
}

pub fn runs(
    conn: &Connection,
    repo: Option<&str>,
    pr: Option<u64>,
    limit: u32,
) -> Result<Value, String> {
    match (repo, pr) {
        (Some(repo), Some(pr)) => collect(
            conn,
            "SELECT json FROM agent_runs WHERE repo = ?1 AND pr_number = ?2
             ORDER BY started_at DESC LIMIT ?3",
            &[&repo, &pr, &limit],
        ),
        (Some(repo), None) => collect(
            conn,
            "SELECT json FROM agent_runs WHERE repo = ?1 ORDER BY started_at DESC LIMIT ?2",
            &[&repo, &limit],
        ),
        _ => collect(
            conn,
            "SELECT json FROM agent_runs ORDER BY started_at DESC LIMIT ?1",
            &[&limit],
        ),
    }
}

/// What's waiting on you that nothing has reviewed yet. "Reviewed"
/// means a finished `pr review` run exists for it — the same thing the
/// review-status list means by its green badge.
pub fn queue(conn: &Connection, include_queued: bool) -> Result<Value, String> {
    let requests = collect(
        conn,
        "SELECT json FROM review_requests ORDER BY fetched_at DESC, repo, number",
        &[],
    )?;
    let mut out = Vec::new();
    for pr in requests.as_array().cloned().unwrap_or_default() {
        let repo = pr
            .get("repo")
            .map(|r| {
                format!(
                    "{}/{}",
                    r.get("owner").and_then(Value::as_str).unwrap_or_default(),
                    r.get("name").and_then(Value::as_str).unwrap_or_default()
                )
            })
            .unwrap_or_default();
        let number = pr.get("number").and_then(Value::as_u64).unwrap_or_default();

        let reviewed: u32 = conn
            .query_row(
                "SELECT COUNT(*) FROM agent_runs
                 WHERE repo = ?1 AND pr_number = ?2
                   AND json_extract(json, '$.purpose') = 'pr review'
                   AND json_extract(json, '$.status') NOT IN ('starting', 'running')",
                rusqlite::params![&repo, number],
                |row| row.get(0),
            )
            .map_err(|e| e.to_string())?;
        if reviewed > 0 {
            continue;
        }
        // A request already queued isn't idle — asking twice would
        // start two reviews of the same PR.
        if !include_queued {
            let queued: u32 = conn
                .query_row(
                    "SELECT COUNT(*) FROM review_jobs WHERE repo = ?1 AND number = ?2
                       AND (started_at IS NULL OR error IS NULL)",
                    rusqlite::params![&repo, number],
                    |row| row.get(0),
                )
                .map_err(|e| e.to_string())?;
            if queued > 0 {
                continue;
            }
        }
        out.push(pr);
    }
    Ok(Value::Array(out))
}

/// Record a review request. Opened read-write on purpose and only for
/// this: the queue is an inbox for outside processes, not review data.
pub fn request_review(
    db: &Path,
    repo: &str,
    number: u64,
    agent: Option<&str>,
    by: &str,
) -> Result<Value, String> {
    let conn = Connection::open(db).map_err(|e| format!("can't open {}: {e}", db.display()))?;
    let id = uuid::Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO review_jobs (id, repo, number, agent, requested_by, requested_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        rusqlite::params![id, repo, number, agent, by, chrono::Utc::now().to_rfc3339()],
    )
    .map_err(|e| e.to_string())?;
    Ok(serde_json::json!({
        "queued": true,
        "id": id,
        "repo": repo,
        "pr": number,
        "agent": agent,
        "note": "Tandem starts this within ~20s while it is running",
    }))
}
