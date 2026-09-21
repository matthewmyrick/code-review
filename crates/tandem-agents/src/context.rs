//! Build the run-context block prepended to every agent prompt.
//!
//! The agent must know it is inside Tandem's review flow (like hunk's CLI
//! contract): it reviews a diff and emits local comments — it must NOT
//! try to post anything to GitHub. Values are interpolated literally
//! (agentd learned that scoped tool allowlists reject `$VAR`).

use tandem_core::github::PullRequest;

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
        "# Tandem review context\n\
         You are running inside Tandem, a local code-review app. You are \
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
         {{\"type\":\"tandem_comment\",\"path\":\"<file>\",\"side\":\"new|old\",\
         \"line\":<n>,\"end_line\":<n|null>,\
         \"severity\":\"info|suggestion|issue|blocker\",\
         \"body\":\"<markdown>\",\"suggestion\":<null or \"replacement code\">}}\n\n\
         Rules: `line` is the line number in the new file (or old file \
         when side=old) and must be a line that appears in the diff below. \
         When you can propose an exact fix, set `suggestion` to the \
         COMPLETE replacement for lines line..=end_line on the new side \
         (end_line defaults to line; preserve indentation; no code \
         fences) — the reviewer gets a one-click 'commit suggestion' \
         button for it. Use null when no concrete fix applies. \
         Do NOT wrap the JSON in code fences. The `body` MUST be \
         well-formatted GitHub-flavored markdown: backticked code spans \
         for identifiers, fenced code blocks for multi-line code, tables \
         or lists where they aid clarity (escape newlines as \\n inside \
         the JSON string). Keep bodies concise and actionable. The \
         comments ARE the review — do not write a summary paragraph \
         instead of comments.\n\n\
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

/// One message of a review-comment thread, oldest first.
#[derive(Debug, Clone)]
pub struct ThreadMessage {
    /// "you" for the human, otherwise the agent name.
    pub author: String,
    pub body: String,
}

/// Everything a reply run needs to continue a comment thread.
#[derive(Debug, Clone)]
pub struct ReplyContext {
    pub run_id: String,
    pub comments_file: String,
    /// Root comment id — the agent's reply must carry this as parent_id.
    pub parent_id: String,
    pub path: String,
    pub side: String,
    pub line: u64,
    /// Diff excerpt for the file under discussion.
    pub diff_text: String,
}

/// Prompt for continuing a discussion on an existing local comment.
pub fn build_reply_prompt(
    ctx: &ReplyContext,
    pr: &PullRequest,
    thread: &[ThreadMessage],
    instructions: &str,
) -> String {
    let mut rendered_thread = String::new();
    for msg in thread {
        rendered_thread.push_str(&format!("### {}\n{}\n\n", msg.author, msg.body));
    }
    format!(
        "# Tandem review thread\n\
         You are running inside Tandem, a local code-review app, continuing \
         a discussion about one review comment. Your reply stays LOCAL — \
         never attempt to post to GitHub or call `gh`.\n\n\
         - run id: {run_id}\n\
         - repository: {repo}\n\
         - pull request: #{number} — {title}\n\
         - comment anchor: {path}:{line} (side: {side})\n\n\
         ## The thread so far (oldest first)\n\
         {thread}\
         ## How to reply\n\
         Respond to the latest message. Emit EXACTLY ONE JSON object on \
         its own line in your final response (no code fences):\n\n\
         {{\"type\":\"tandem_comment\",\"path\":\"{path}\",\"side\":\"{side}\",\
         \"line\":{line},\"severity\":\"info\",\
         \"parent_id\":\"{parent_id}\",\"body\":\"<your reply, markdown>\"}}\n\n\
         The `body` MUST be well-formatted GitHub-flavored markdown — \
         code spans, fenced code blocks, tables and lists where they help \
         (escape newlines as \\n inside the JSON string). Keep the reply \
         focused and conversational — you are talking with the reviewer. \
         Acknowledge if they are right; push back with evidence if not.\n\n\
         ## Original review instructions\n\
         {instructions}\n\n\
         ## Diff context for {path}\n\
         ```diff\n{diff}\n```\n",
        run_id = ctx.run_id,
        repo = pr.repo.slug(),
        number = pr.number,
        title = pr.title,
        path = ctx.path,
        side = ctx.side,
        line = ctx.line,
        parent_id = ctx.parent_id,
        thread = rendered_thread,
        instructions = instructions,
        diff = ctx.diff_text,
    )
}

#[cfg(test)]
#[allow(clippy::unwrap_used)]
mod tests {
    use super::*;
    use chrono::Utc;
    use tandem_core::github::{PrState, RepoRef, User};

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
            mergeable_state: None,
            requested_reviewers: vec![],
            node_id: None,
            review_decision: None,
            checks_state: None,
            unresolved_threads: 0,
        };
        let ctx = ReviewContext {
            run_id: "run-1".into(),
            comments_file: "/tmp/run-1/comments.jsonl".into(),
            diff_text: "+ hello".into(),
        };
        let prompt = build_prompt(&ctx, &pr, "focus on correctness");
        assert!(prompt.contains("tandem_comment"));
        assert!(prompt.contains("o/r"));
        assert!(prompt.contains("#42"));
        assert!(prompt.contains("focus on correctness"));
        assert!(prompt.contains("+ hello"));
        assert!(prompt.contains("never attempt to post to GitHub"));
    }
}
