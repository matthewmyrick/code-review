# Tandem

**Local-first code review that works with your agents.**

Tandem is a desktop app (Tauri 2 + Rust + React) for reviewing GitHub pull
requests with AI agents riding along. It pulls everything about a PR from
GitHub — diff, checks, reviews, approvers, comments — renders a fast,
pretty differ, and lets a locally-run agent (Claude, Codex, or any custom
command) review the diff with you.

The twist: **agent comments never go to GitHub on their own.** They
land as local comments in Tandem, where you triage them (accept / reject
/ archive), discuss them in threads (@mention any agent), and — only
when you explicitly click post — push a chosen comment or an approval
back to GitHub. Two riders, one bike: the agents pedal with you, but
you steer.

## How it works

```mermaid
flowchart LR
    GH["GitHub"]
    subgraph core["Rust core · tokio"]
        direction TB
        client["tandem-github<br/>auth: gh CLI · PAT · GHES"]
        cache[("tandem-cache<br/>SQLite, cache-first")]
        runners["tandem-agents<br/>headless runners"]
    end
    UI["React UI<br/>differ · threads · agent feed"]
    proc["agent process<br/>claude -p · codex exec · custom"]

    GH -- "reads: PRs, diffs, checks, comments" --> client
    client --> cache
    cache -- "instant renders" --> UI
    UI -- "Tauri IPC + events" --> core
    runners -- spawns --> proc
    proc -- "JSONL events · tandem_comment" --> runners
    runners -- "local comments" --> cache
    UI -- "explicit click only: post / approve" --> GH
```

And the review loop itself:

```mermaid
sequenceDiagram
    actor You
    participant T as Tandem
    participant A as Agent (claude/codex)
    participant G as GitHub

    You->>T: open a PR
    T->>G: sync diff, checks, comments
    T-->>You: instant render from cache
    You->>T: run review (or @mention an agent)
    T->>A: prompt: PR context + diff + rules
    A-->>T: tandem_comment lines (stay local)
    You->>T: triage — accept / reject / archive / reply
    A-->>T: replies in-thread
    You->>G: post chosen comment / approve (explicit click)
```

- **Cache-first**: the UI renders instantly from SQLite, background syncs
  refresh from GitHub, and sync state is always visible.
- **Bring your own AI**: reuse a CLI login (claude/codex), supply an API
  key, or point at a custom endpoint. Configure everything in-app.
- **Agents know they're reviewing**: each run gets a context block (PR,
  diff, rules) and a simple contract — emit
  `{"type":"tandem_comment", ...}` lines — inspired by
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
session) → add a repo (browse your orgs or type `owner/name`) → pick a
PR → add an agent → **run review**.

## Project layout

| Path                   | What                                                      |
| ---------------------- | --------------------------------------------------------- |
| `crates/tandem-core`   | Domain types: PRs, diffs, local comments, agent specs     |
| `crates/tandem-github` | GitHub REST client — reads + explicit user-action writes  |
| `crates/tandem-cache`  | SQLite cache, local review store, 3-day merged-PR archive |
| `crates/tandem-agents` | Agent runners (headless claude/codex/custom), JSONL logs  |
| `src-tauri`            | Tauri shell: commands, events, settings                   |
| `src/`                 | React frontend (differ, panels, settings)                 |
| `docs/`                | Architecture, sandboxing (v2 Docker+squid), roadmap       |

## Standards

Strict CI is the deploy gate: if a PR is green, it's safe to ship. No
source file exceeds **400 lines**. See [CONTRIBUTING.md](CONTRIBUTING.md)
and [AGENTS.md](AGENTS.md).

## Security model (v1 → v2)

v1 runs agents as local processes — same trust level as running the CLI
yourself. GitHub writes happen only behind explicit user clicks; agents
have no write path. **v2 moves agent execution into Docker with a squid
proxy** so each agent can only reach the endpoints you allowlist. The
`network_allowlist` field already exists on every agent spec; see
[docs/SANDBOXING.md](docs/SANDBOXING.md) for the plan.
