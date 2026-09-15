//! Build the run-context block prepended to every agent prompt.
//!
//! The agent must know it is inside Appa's review flow (like hunk's CLI
//! contract): it reviews a diff and emits local comments — it must NOT
//! try to post anything to GitHub. Values are interpolated literally
//! (agentd learned that scoped tool allowlists reject `$VAR`).

use appa_core::github::PullRequest;

/// Everything the agent needs to know about where it is running.
#[derive(Debug, Clone)]
pub struct ReviewContext {
    pub run_id: String,
    pub comments_file: String,
    pub diff_text: String,
}

/// Assemble the full prompt fed to the runner on stdin:
/// context block + user's review instructions + the diff itself.
pub fn build_prompt(ctx: &ReviewContext, pr: &PullRequest, instructions: &str) -> String {
    format!(
        "# Appa review context\n\
         You are running inside Appa, a local code-review app. You are \
         reviewing a GitHub pull request, but your comments stay LOCAL — \
         never attempt to post to GitHub or call `gh`.\n\n\
         - run id: {run_id}\n\
         - repository: {repo}\n\
         - pull request: #{number} — {title}\n\
         - branch: {head} -> {base}\n\
         - head sha: {sha}\n\n\
         ## How to emit review comments\n\
         Write one JSON object per comment, each on its own line, in your \
         FINAL response text (no tools needed — this is the preferred \
         path). Alternatively, append the same lines to the file \
         `{comments_file}`.\n\n\
         {{\"type\":\"appa_comment\",\"path\":\"<file>\",\"side\":\"new|old\",\
         \"line\":<n>,\"severity\":\"info|suggestion|issue|blocker\",\
         \"body\":\"<markdown>\"}}\n\n\
         Rules: `line` is the line number in the new file (or old file \
         when side=old) and must be a line that appears in the diff below. \
         Do NOT wrap the JSON in code fences. Keep bodies concise and \
         actionable. The comments ARE the review — do not write a summary \
         paragraph instead of comments.\n\n\
         ## Review instructions\n\
         {instructions}\n\n\
         ## Pull request description\n\
         {body}\n\n\
         ## Diff\n\
         ```diff\n{diff}\n```\n",
        run_id = ctx.run_id,
        repo = pr.repo.slug(),
        number = pr.number,
        title = pr.title,
        head = pr.head_ref,
        base = pr.base_ref,
        sha = pr.head_sha,
        comments_file = ctx.comments_file,
        instructions = instructions,
        body = pr.body,
        diff = ctx.diff_text,
    )
}

#[cfg(test)]
#[allow(clippy::unwrap_used)]
mod tests {
    use super::*;
    use appa_core::github::{PrState, RepoRef, User};
    use chrono::Utc;

    #[test]
    fn prompt_contains_contract_and_diff() {
        let pr = PullRequest {
            repo: RepoRef::parse("o/r").unwrap(),
            number: 42,
            title: "Add thing".into(),
            body: "does thing".into(),
            state: PrState::Open,
            draft: false,
            author: User {
                login: "matt".into(),
                avatar_url: None,
            },
            head_ref: "feat".into(),
            head_sha: "abc".into(),
            base_ref: "main".into(),
            additions: 0,
            deletions: 0,
            changed_files: 0,
            created_at: Utc::now(),
            updated_at: Utc::now(),
            labels: vec![],
        };
        let ctx = ReviewContext {
            run_id: "run-1".into(),
            comments_file: "/tmp/run-1/comments.jsonl".into(),
            diff_text: "+ hello".into(),
        };
        let prompt = build_prompt(&ctx, &pr, "focus on correctness");
        assert!(prompt.contains("appa_comment"));
        assert!(prompt.contains("o/r"));
        assert!(prompt.contains("#42"));
        assert!(prompt.contains("focus on correctness"));
        assert!(prompt.contains("+ hello"));
        assert!(prompt.contains("never attempt to post to GitHub"));
    }
}
