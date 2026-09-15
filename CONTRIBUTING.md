# Contributing to Appa

The core promise: **if CI is green, the change is safe to deploy.** Every
rule below is enforced by CI (`.github/workflows/ci.yml`), not by hoping.

## The rules

### Readability

- **No source file over 400 lines** (`scripts/check-file-length.sh`,
  ESLint `max-lines`). If a file wants to grow past that, it's telling
  you to split a responsibility out.
- Files have one job. Name the file after the job.
- Comments explain constraints the code can't (_why_, never _what_).

### Rust

- `cargo fmt` clean; `cargo clippy --workspace --all-targets` with **zero
  warnings** (CI passes `-D warnings`).
- Workspace lints (root `Cargo.toml`) deny `unwrap`, `expect`, `panic!`,
  `todo!`, `dbg!`, and `unsafe`. Errors flow through `AppaError` — the
  user sees a message, never a crash. Tests may `#[allow]` unwrap.
- All I/O is async (tokio) or explicitly documented as a small blocking
  write. Never block the UI thread; never busy-loop — wait on channels,
  `select!`, or timeouts.
- Bounded resources: event payloads are capped, log tails are truncated,
  timeouts wrap every child process. A stuck agent must never wedge the
  app.

### TypeScript / React

- `tsc` strict (plus `noUncheckedIndexedAccess`), ESLint
  `strict-type-checked` with `--max-warnings 0`, Prettier check.
- No `any`, no non-null `!` unless provably safe, exhaustive switches on
  domain unions (enforced by lint).
- All IPC goes through `src/lib/ipc.ts`; all shared state through the
  zustand store. Components stay presentational.
- Render from cache first; every network wait must show a visible
  loading/sync state.

### Data handling

- GitHub data is **read-only**: Appa never posts, edits, or deletes
  anything on GitHub. Agent + human review comments stay in the local
  SQLite cache.
- Secrets (PATs, API keys) never go in the cache DB, logs, or the repo.
  Settings files are written `0600`.
- Cache schema changes are append-only migrations
  (`crates/appa-cache/src/schema.rs`) — never edit a shipped migration.

### Tests

- New parsing, caching, or process-handling logic ships with unit tests.
  Bug fixes ship with a regression test.
- Tests must not touch the network.

## Workflow

1. Branch from `main`; keep PRs small and single-purpose.
2. Before pushing, run the same gates CI runs:

   ```sh
   cargo fmt --all -- --check
   cargo clippy --workspace --all-targets -- -D warnings
   cargo test --workspace
   pnpm lint && pnpm format:check && pnpm build
   ./scripts/check-file-length.sh
   ```

3. CI must be fully green before merge. There are no optional checks.

## For AI agents

If you're an agent working in this repo, also read [AGENTS.md](AGENTS.md)
— it's the operational version of this document.
