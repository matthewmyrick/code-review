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
         button for it. To delete lines outright, set `suggestion` to \
         the empty string \"\". Use null when no concrete fix applies. \
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
         \"line\":{line},\"end_line\":null,\"severity\":\"info\",\
         \"parent_id\":\"{parent_id}\",\"body\":\"<your reply, markdown>\",\
         \"suggestion\":null}}\n\n\
         When the reviewer asks for a concrete code change, set \
         `suggestion` to the COMPLETE replacement for lines \
         line..=end_line of {path} (new side; preserve indentation; no \
         code fences; escape newlines as \\n). Re-anchor `line` and \
         `end_line` to the EXACT range your fix replaces — e.g. a whole \
         block, not just the thread's anchor line. To DELETE lines \
         outright, set `suggestion` to the empty string \"\" with \
         line/end_line covering the lines to remove. The reviewer gets a \
         one-click 'commit suggestion' button that commits your \
         suggestion verbatim to the PR branch — so prefer a committable \
         suggestion over prose instructions whenever the fix is exact.\n\n\
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

/// One likely-conflicting file: the PR touches it AND the base branch
/// changed it since the merge-base.
#[derive(Debug, Clone)]
pub struct ConflictFile {
    pub path: String,
    /// Patch of what the BASE branch did to this file since branching.
    pub base_patch: Option<String>,
}

#[derive(Debug, Clone)]
pub struct ConflictContext {
    pub run_id: String,
    pub comments_file: String,
    pub files: Vec<ConflictFile>,
    /// The PR's own diff.
    pub diff_text: String,
}

/// Prompt for analyzing merge conflicts and opening a local discussion.
pub fn build_conflict_prompt(ctx: &ConflictContext, pr: &PullRequest) -> String {
    let mut files_block = String::new();
    for file in &ctx.files {
        files_block.push_str(&format!("### {}\n", file.path));
        match &file.base_patch {
            Some(patch) => {
                files_block.push_str("Base-branch changes since branching:\n```diff\n");
                files_block.push_str(patch);
                files_block.push_str("\n```\n\n");
            }
            None => files_block.push_str("(base patch unavailable — likely binary or huge)\n\n"),
        }
    }
    format!(
        "# Tandem merge-conflict analysis\n\
         You are running inside Tandem, a local code-review app. PR #{number} \
         ({title}) has MERGE CONFLICTS with `{base}`. Below are the files both \
         sides touched: the base branch's changes since branching, and the \
         PR's own diff. Everything stays LOCAL — never call `gh` or git push.\n\n\
         ## Your task\n\
         Emit EXACTLY ONE JSON object on its own line in your final response \
         (no code fences):\n\n\
         {{\"type\":\"tandem_comment\",\"path\":\"\",\"side\":\"new\",\"line\":0,\"severity\":\"info\",\"body\":\"<markdown>\"}}\n\n\
         Keep \"path\" as an EMPTY string and \"line\" 0 exactly as shown — \
         that makes it a PR-level comment; do NOT point it at a file.\n\n\
         The body is a conflict-resolution briefing in GitHub-flavored \
         markdown: for EACH conflicting file, summarize what the PR changes \
         vs what base changed, propose a concrete resolution (show merged \
         code in fenced blocks where helpful), and end with any questions \
         you need answered. The reviewer will reply in this thread — treat \
         it as the start of a conversation.\n\n\
         - run id: {run_id}\n\
         - branch: {head} -> {base}\n\n\
         ## Likely-conflicting files\n\
         {files}\n\
         ## The PR's diff\n\
         ```diff\n{diff}\n```\n",
        number = pr.number,
        title = pr.title,
        base = pr.base_ref,
        head = pr.head_ref,
        run_id = ctx.run_id,
        files = files_block,
        diff = ctx.diff_text,
    )
}

#[cfg(test)]
#[allow(clippy::unwrap_used)]
mod tests {
    use super::*;
    use chrono::Utc;
    use tandem_core::github::{PrState, RepoRef, User};

    fn fixture_pr() -> PullRequest {
        PullRequest {
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
        }
    }

    #[test]
    fn prompt_contains_contract_and_diff() {
        let pr = fixture_pr();
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

    #[test]
    fn reply_prompt_teaches_suggestions() {
        let ctx = ReplyContext {
            run_id: "run-2".into(),
            comments_file: "/tmp/run-2/comments.jsonl".into(),
            parent_id: "root-1".into(),
            path: "src/x.rs".into(),
            side: "new".into(),
            line: 56,
            diff_text: "+ hi".into(),
        };
        let thread = vec![ThreadMessage {
            author: "you".into(),
            body: "remove this line please".into(),
        }];
        let prompt = build_reply_prompt(&ctx, &fixture_pr(), &thread, "be terse");
        assert!(prompt.contains("\"suggestion\":null"));
        assert!(prompt.contains("end_line"));
        assert!(prompt.contains("DELETE lines"));
        assert!(prompt.contains("parent_id"));
    }
}
