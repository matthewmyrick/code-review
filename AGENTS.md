# AGENTS.md — working in the Appa repo

You are working on **Appa**, a local-first PR review desktop app
(Tauri 2: Rust workspace + React/TypeScript). This file is the contract
for any coding agent (Claude, Codex, or otherwise). CLAUDE.md points
here; CONTRIBUTING.md is the human-flavored version.

## Ground rules (CI enforces all of these)

1. **400-line limit** on every source file. Check before you finish:
   `./scripts/check-file-length.sh`. Split modules rather than squeezing.
2. **Zero-warning builds.** Rust: `cargo clippy --workspace --all-targets
-- -D warnings` must pass; no `unwrap`/`expect`/`panic!`/`todo!` in
   non-test code (workspace lints deny them — return `AppaError`
   instead). TS: `pnpm lint` (`--max-warnings 0`) and `pnpm typecheck`.
3. **Format before finishing:** `cargo fmt --all` and `pnpm format`.
4. **Tests:** run `cargo test --workspace`. Add tests for any new parser,
   cache, or process logic. Never call the network in tests.
5. **Read-only GitHub.** Do not add code that writes to GitHub (comments,
   reviews, statuses). Review output stays local by design.
6. **Secrets** never in code, cache DB, logs, or fixtures.

## Architecture map (where things go)

- `crates/appa-core` — pure domain types + diff parser. No I/O, no heavy
  deps. Everything speaks these types.
- `crates/appa-github` — GitHub REST client. Wire structs in `wire.rs`,
  HTTP in `client.rs`, auth strategies in `auth.rs`.
- `crates/appa-cache` — SQLite. GitHub-data caching in `store.rs`,
  local-only review data in `review_store.rs`. Migrations are
  append-only (`schema.rs`).
- `crates/appa-agents` — agent runners. argv building in `command.rs`,
  stdout classification in `events.rs`, prompt assembly in `context.rs`,
  process lifecycle in `runner.rs`.
- `src-tauri` — thin shell: commands in `src/commands/*`, one file per
  domain. Commands validate, lock state briefly, delegate to crates.
- `src/` (frontend) — IPC only via `lib/ipc.ts`, state only via
  `state/store.ts`, types mirrored in `lib/types.ts` (keep in sync with
  Rust serde output: snake_case fields, `kind`-tagged enums).

## Patterns to follow

- **Cache-first**: `get_*` commands read SQLite and return immediately;
  `sync_*` commands hit GitHub, update the cache, and emit `appa://sync`
  events. Never make the UI wait on the network without a sync event.
- **Events over polling**: backend pushes (`appa://sync`,
  `appa://agent-event`, `appa://comments-updated`, `appa://run-updated`);
  frontend listens in `store.init()`.
- **Agent contract**: agents emit `{"type":"appa_comment","path":…,
"side":"new|old","line":…,"severity":…,"body":…}` on stdout or into
  `$APPA_COMMENTS_FILE`. If you change the contract, update
  `context.rs`, `events.rs`, and this file together.
- **Errors**: every fallible path returns `AppaError` with a message a
  user could act on ("`gh auth token` failed — is the gh CLI logged
  in?"), and failures surface in the UI error bar, not just logs.

## Verifying your work

Minimum bar before declaring done:

```sh
cargo fmt --all -- --check && \
cargo clippy --workspace --all-targets -- -D warnings && \
cargo test --workspace && \
pnpm lint && pnpm typecheck && pnpm build && \
./scripts/check-file-length.sh
```

If you changed runtime behavior, run `pnpm tauri dev` and exercise the
flow you touched.

## v2 heads-up

Agent execution will move into a **Docker + squid proxy sandbox**
(docs/SANDBOXING.md). Keep `appa-agents` runner-agnostic: anything that
assumes "local process" belongs in `runner.rs` behind the existing
interfaces, so the sandbox backend can slot in beside it.
