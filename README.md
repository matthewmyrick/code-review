# 🦬 Appa

**Local-first code review that works with your agents.**

Appa is a desktop app (Tauri 2 + Rust + React) for reviewing GitHub pull
requests with AI agents riding along. It pulls everything about a PR from
GitHub — diff, checks, reviews, approvers, comments — renders a fast,
pretty differ, and lets a locally-run agent (Claude, Codex, or any custom
command) review the diff with you.

The twist: **agent comments never go to GitHub.** They land as local
comments in Appa, where you triage them (accept / reject / resolve)
before deciding what, if anything, becomes real feedback. Like Appa the
sky bison: it carries the whole team, but you hold the reins.

## How it works

```
┌────────────┐   REST (read-only)   ┌─────────────┐
│  GitHub    │ ───────────────────► │  Rust core   │
└────────────┘                      │  (tokio)     │
                                    │   ├─ appa-github  auth: gh CLI / PAT / GHES
                                    │   ├─ appa-cache   SQLite, cache-first UI
                                    │   └─ appa-agents  headless runners
                                    └──────┬──────┘
                                           │ Tauri IPC + events
                                    ┌──────▼──────┐        ┌──────────────┐
                                    │  React UI   │        │ agent process │
                                    │  (differ,   │◄──────┤ claude -p /   │
                                    │  comments)  │ JSONL  │ codex exec /  │
                                    └─────────────┘ events │ custom cmd    │
                                                           └──────────────┘
```

- **Cache-first**: the UI renders instantly from SQLite, background syncs
  refresh from GitHub, and sync state is always visible.
- **Bring your own AI**: reuse a CLI login (claude/codex), supply an API
  key, or point at a custom endpoint. Configure everything in-app.
- **Agents know they're reviewing**: each run gets a context block (PR,
  diff, rules) and a simple contract — emit
  `{"type":"appa_comment", ...}` lines — inspired by
  [hunk](https://github.com/modem-dev/hunk).
- **Obvious logging**: every run writes a JSONL event log you can tail in
  the UI or grep on disk.

## Getting started

Prereqs: Rust (stable), Node 22+, pnpm, and optionally the `gh` CLI
(easiest auth).

```sh
pnpm install
pnpm tauri dev
```

In the app: **settings → GitHub auth** (defaults to your `gh` CLI
session) → add a repo (`owner/name`) → pick a PR → add an agent → **▶
review**.

## Project layout

| Path                 | What                                                     |
| -------------------- | -------------------------------------------------------- |
| `crates/appa-core`   | Domain types: PRs, diffs, local comments, agent specs    |
| `crates/appa-github` | Read-only GitHub REST client, pluggable auth             |
| `crates/appa-cache`  | SQLite cache + local review store                        |
| `crates/appa-agents` | Agent runners (headless claude/codex/custom), JSONL logs |
| `src-tauri`          | Tauri shell: commands, events, settings                  |
| `src/`               | React frontend (differ, panels, settings)                |
| `docs/`              | Architecture, sandboxing (v2 Docker+squid), roadmap      |

## Standards

Strict CI is the deploy gate: if a PR is green, it's safe to ship. No
source file exceeds **400 lines**. See [CONTRIBUTING.md](CONTRIBUTING.md)
and [AGENTS.md](AGENTS.md).

## Security model (v1 → v2)

v1 runs agents as local processes — same trust level as running the CLI
yourself. **v2 moves agent execution into Docker with a squid proxy** so
each agent can only reach the endpoints you allowlist. The
`network_allowlist` field already exists on every agent spec; see
[docs/SANDBOXING.md](docs/SANDBOXING.md) for the plan.
