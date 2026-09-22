//! Local-only review data: comments, agent specs, and agent runs.
//! None of this ever leaves the machine.

use chrono::Utc;
use rusqlite::{params, OptionalExtension};
use tandem_core::agent::{AgentRun, AgentSpec, RunStatus};
use tandem_core::github::RepoRef;
use tandem_core::review::{CommentStatus, LocalComment, NewLocalComment};
use tandem_core::{Result, TandemError};
use uuid::Uuid;

use crate::schema::cache_err;
use crate::Cache;

/// Review-side operations, implemented on the same connection as
/// [`Cache`] so everything shares one database file.
pub trait ReviewStore {
    fn add_comment(&self, new: NewLocalComment) -> Result<LocalComment>;
    fn get_comment(&self, id: &str) -> Result<Option<LocalComment>>;
    fn list_comments(&self, repo: &RepoRef, pr_number: u64) -> Result<Vec<LocalComment>>;
    fn set_comment_status(&self, id: &str, status: CommentStatus) -> Result<()>;
    fn set_comment_posted(&self, id: &str, github_id: u64) -> Result<()>;
    fn update_comment_body(&self, id: &str, body: &str) -> Result<()>;
    fn delete_comment(&self, id: &str) -> Result<()>;

    fn put_agent_spec(&self, spec: &AgentSpec) -> Result<()>;
    fn list_agent_specs(&self) -> Result<Vec<AgentSpec>>;
    fn delete_agent_spec(&self, name: &str) -> Result<()>;

    fn put_agent_run(&self, run: &AgentRun) -> Result<()>;
    fn get_agent_run(&self, run_id: &str) -> Result<Option<AgentRun>>;
    fn list_agent_runs(&self, repo: &RepoRef, pr_number: u64) -> Result<Vec<AgentRun>>;
    fn list_recent_runs(&self, limit: u32) -> Result<Vec<AgentRun>>;
    fn delete_agent_run(&self, run_id: &str) -> Result<()>;
    fn sweep_stale_runs(&self) -> Result<u32>;
}

impl ReviewStore for Cache {
    fn add_comment(&self, new: NewLocalComment) -> Result<LocalComment> {
        let now = Utc::now();
        let comment = LocalComment {
            id: Uuid::new_v4().to_string(),
            repo: new.repo,
            pr_number: new.pr_number,
            head_sha: new.head_sha,
            path: new.path,
            side: new.side,
            line: new.line,
            end_line: new.end_line,
            body: new.body,
            suggestion: new.suggestion,
            author_kind: new.author_kind,
            author_name: new.author_name,
            severity: new.severity,
            status: CommentStatus::Open,
            run_id: new.run_id,
            parent_id: new.parent_id,
            github_comment_id: new.github_comment_id,
            posted_github_id: None,
            created_at: now,
            updated_at: now,
        };
        self.conn
            .execute(
                "INSERT INTO local_comments (id, repo, pr_number, updated_at, json)
                 VALUES (?1, ?2, ?3, ?4, ?5)",
                params![
                    comment.id,
                    comment.repo.slug(),
                    comment.pr_number,
                    now.to_rfc3339(),
                    serde_json::to_string(&comment)?
                ],
            )
            .map_err(cache_err)?;
        Ok(comment)
    }

    fn get_comment(&self, id: &str) -> Result<Option<LocalComment>> {
        let json: Option<String> = self
            .conn
            .query_row(
                "SELECT json FROM local_comments WHERE id = ?1",
                params![id],
                |row| row.get(0),
            )
            .optional()
            .map_err(cache_err)?;
        match json {
            None => Ok(None),
            Some(j) => Ok(Some(serde_json::from_str(&j)?)),
        }
    }

    fn list_comments(&self, repo: &RepoRef, pr_number: u64) -> Result<Vec<LocalComment>> {
        let mut stmt = self
            .conn
            .prepare(
                "SELECT json FROM local_comments
                 WHERE repo = ?1 AND pr_number = ?2 ORDER BY updated_at ASC",
            )
            .map_err(cache_err)?;
        let rows = stmt
            .query_map(params![repo.slug(), pr_number], |row| {
                row.get::<_, String>(0)
            })
            .map_err(cache_err)?;
        let mut out = Vec::new();
        for row in rows {
            out.push(serde_json::from_str(&row.map_err(cache_err)?)?);
        }
        Ok(out)
    }

    fn set_comment_status(&self, id: &str, status: CommentStatus) -> Result<()> {
        self.mutate_comment(id, |c| c.status = status)
    }

    fn set_comment_posted(&self, id: &str, github_id: u64) -> Result<()> {
        self.mutate_comment(id, |c| c.posted_github_id = Some(github_id))
    }

    fn update_comment_body(&self, id: &str, body: &str) -> Result<()> {
        self.mutate_comment(id, |c| c.body = body.to_owned())
    }

    fn delete_comment(&self, id: &str) -> Result<()> {
        // Deleting a thread root must not shatter the thread: promote
        // the oldest reply to be the new root and re-parent the rest
        // onto it, so the conversation survives the deletion.
        let mut stmt = self
            .conn
            .prepare(
                "SELECT json FROM local_comments
                 WHERE json_extract(json, '$.parent_id') = ?1
                 ORDER BY json_extract(json, '$.created_at')",
            )
            .map_err(cache_err)?;
        let rows = stmt
            .query_map(params![id], |row| row.get::<_, String>(0))
            .map_err(cache_err)?;
        let mut replies: Vec<LocalComment> = Vec::new();
        for row in rows {
            replies.push(serde_json::from_str(&row.map_err(cache_err)?)?);
        }
        if let Some((new_root, rest)) = replies.split_first() {
            let root_id = new_root.id.clone();
            self.mutate_comment(&root_id, |c| c.parent_id = None)?;
            for reply in rest {
                self.mutate_comment(&reply.id, |c| {
                    c.parent_id = Some(root_id.clone());
                })?;
            }
        }
        self.conn
            .execute("DELETE FROM local_comments WHERE id = ?1", params![id])
            .map_err(cache_err)?;
        Ok(())
    }

    fn put_agent_spec(&self, spec: &AgentSpec) -> Result<()> {
        self.conn
            .execute(
                "INSERT OR REPLACE INTO agent_specs (name, json) VALUES (?1, ?2)",
                params![spec.name, serde_json::to_string(spec)?],
            )
            .map_err(cache_err)?;
        Ok(())
    }

    fn list_agent_specs(&self) -> Result<Vec<AgentSpec>> {
        let mut stmt = self
            .conn
            .prepare("SELECT json FROM agent_specs ORDER BY name ASC")
            .map_err(cache_err)?;
        let rows = stmt
            .query_map([], |row| row.get::<_, String>(0))
            .map_err(cache_err)?;
        let mut out = Vec::new();
        for row in rows {
            out.push(serde_json::from_str(&row.map_err(cache_err)?)?);
        }
        Ok(out)
    }

    fn delete_agent_spec(&self, name: &str) -> Result<()> {
        self.conn
            .execute("DELETE FROM agent_specs WHERE name = ?1", params![name])
            .map_err(cache_err)?;
        Ok(())
    }

    fn put_agent_run(&self, run: &AgentRun) -> Result<()> {
        self.conn
            .execute(
                "INSERT OR REPLACE INTO agent_runs (run_id, repo, pr_number, started_at, json)
                 VALUES (?1, ?2, ?3, ?4, ?5)",
                params![
                    run.run_id,
                    run.repo_slug,
                    run.pr_number,
                    run.started_at.to_rfc3339(),
                    serde_json::to_string(run)?
                ],
            )
            .map_err(cache_err)?;
        Ok(())
    }

    fn get_agent_run(&self, run_id: &str) -> Result<Option<AgentRun>> {
        let json: Option<String> = self
            .conn
            .query_row(
                "SELECT json FROM agent_runs WHERE run_id = ?1",
                params![run_id],
                |row| row.get(0),
            )
            .optional()
            .map_err(cache_err)?;
        Ok(match json {
            Some(json) => Some(serde_json::from_str(&json)?),
            None => None,
        })
    }

    fn delete_agent_run(&self, run_id: &str) -> Result<()> {
        // The run's conversation goes with it: comments the run created
        // plus any replies threaded under them.
        self.conn
            .execute(
                "DELETE FROM local_comments WHERE json_extract(json, '$.parent_id') IN
                   (SELECT id FROM local_comments WHERE json_extract(json, '$.run_id') = ?1)",
                params![run_id],
            )
            .map_err(cache_err)?;
        self.conn
            .execute(
                "DELETE FROM local_comments WHERE json_extract(json, '$.run_id') = ?1",
                params![run_id],
            )
            .map_err(cache_err)?;
        self.conn
            .execute("DELETE FROM agent_runs WHERE run_id = ?1", params![run_id])
            .map_err(cache_err)?;
        Ok(())
    }

    /// Runs can't survive an app restart (their process and cancel
    /// handle die with it), so any row still starting/running at
    /// startup is a zombie — mark it failed.
    fn sweep_stale_runs(&self) -> Result<u32> {
        let mut stmt = self
            .conn
            .prepare(
                "SELECT json FROM agent_runs
                 WHERE json_extract(json, '$.status') IN ('starting', 'running')",
            )
            .map_err(cache_err)?;
        let rows = stmt
            .query_map([], |row| row.get::<_, String>(0))
            .map_err(cache_err)?;
        let mut runs: Vec<AgentRun> = Vec::new();
        for row in rows {
            runs.push(serde_json::from_str(&row.map_err(cache_err)?)?);
        }
        for run in &mut runs {
            run.status = RunStatus::Failed;
            run.finished_at = Some(Utc::now());
            run.error = Some("interrupted — the app restarted mid-run".into());
            self.put_agent_run(run)?;
        }
        Ok(u32::try_from(runs.len()).unwrap_or(u32::MAX))
    }

    fn list_recent_runs(&self, limit: u32) -> Result<Vec<AgentRun>> {
        let mut stmt = self
            .conn
            .prepare("SELECT json FROM agent_runs ORDER BY started_at DESC LIMIT ?1")
            .map_err(cache_err)?;
        let rows = stmt
            .query_map(params![limit], |row| row.get::<_, String>(0))
            .map_err(cache_err)?;
        let mut out = Vec::new();
        for row in rows {
            out.push(serde_json::from_str(&row.map_err(cache_err)?)?);
        }
        Ok(out)
    }

    fn list_agent_runs(&self, repo: &RepoRef, pr_number: u64) -> Result<Vec<AgentRun>> {
        let mut stmt = self
            .conn
            .prepare(
                "SELECT json FROM agent_runs
                 WHERE repo = ?1 AND pr_number = ?2 ORDER BY started_at DESC",
            )
            .map_err(cache_err)?;
        let rows = stmt
            .query_map(params![repo.slug(), pr_number], |row| {
                row.get::<_, String>(0)
            })
            .map_err(cache_err)?;
        let mut out = Vec::new();
        for row in rows {
            out.push(serde_json::from_str(&row.map_err(cache_err)?)?);
        }
        Ok(out)
    }
}

impl Cache {
    fn mutate_comment(&self, id: &str, f: impl FnOnce(&mut LocalComment)) -> Result<()> {
        let json: Option<String> = self
            .conn
            .query_row(
                "SELECT json FROM local_comments WHERE id = ?1",
                params![id],
                |row| row.get(0),
            )
            .optional()
            .map_err(cache_err)?;
        let Some(json) = json else {
            return Err(TandemError::Cache(format!("comment not found: {id}")));
        };
        let mut comment: LocalComment = serde_json::from_str(&json)?;
        f(&mut comment);
        comment.updated_at = Utc::now();
        self.conn
            .execute(
                "UPDATE local_comments SET json = ?1, updated_at = ?2 WHERE id = ?3",
                params![
                    serde_json::to_string(&comment)?,
                    comment.updated_at.to_rfc3339(),
                    id
                ],
            )
            .map_err(cache_err)?;
        Ok(())
    }
}
