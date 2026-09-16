//! Local-only review data: comments, agent specs, and agent runs.
//! None of this ever leaves the machine.

use appa_core::agent::{AgentRun, AgentSpec};
use appa_core::github::RepoRef;
use appa_core::review::{CommentStatus, LocalComment, NewLocalComment};
use appa_core::{AppaError, Result};
use chrono::Utc;
use rusqlite::{params, OptionalExtension};
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
    fn list_agent_runs(&self, repo: &RepoRef, pr_number: u64) -> Result<Vec<AgentRun>>;
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
            return Err(AppaError::Cache(format!("comment not found: {id}")));
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

#[cfg(test)]
#[allow(clippy::unwrap_used)]
mod tests {
    use super::*;
    use appa_core::review::{CommentAuthorKind, CommentSeverity, DiffSide};

    fn new_comment(repo: &RepoRef) -> NewLocalComment {
        NewLocalComment {
            repo: repo.clone(),
            pr_number: 1,
            head_sha: "abc".into(),
            path: "src/main.rs".into(),
            side: DiffSide::New,
            line: 3,
            body: "consider a match here".into(),
            author_kind: CommentAuthorKind::Agent,
            author_name: "claude".into(),
            severity: CommentSeverity::Suggestion,
            run_id: Some("run-1".into()),
            parent_id: None,
            end_line: None,
            github_comment_id: None,
        }
    }

    #[test]
    fn comment_lifecycle() {
        let cache = Cache::open_in_memory().unwrap();
        let repo = RepoRef::parse("o/r").unwrap();

        let c = cache.add_comment(new_comment(&repo)).unwrap();
        assert_eq!(c.status, CommentStatus::Open);

        cache
            .set_comment_status(&c.id, CommentStatus::Accepted)
            .unwrap();
        let listed = cache.list_comments(&repo, 1).unwrap();
        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0].status, CommentStatus::Accepted);

        cache.delete_comment(&c.id).unwrap();
        assert!(cache.list_comments(&repo, 1).unwrap().is_empty());
    }

    #[test]
    fn missing_comment_errors() {
        let cache = Cache::open_in_memory().unwrap();
        assert!(cache
            .set_comment_status("nope", CommentStatus::Resolved)
            .is_err());
    }
}
