# CLAUDE.md

Read **[AGENTS.md](AGENTS.md)** — it is the single source of truth for
agents working in this repo (architecture map, hard rules, verification
commands). CONTRIBUTING.md holds the same standards for humans.

Quick reminders:

- Every source file ≤ 400 lines (`./scripts/check-file-length.sh`).
- No `unwrap`/`expect`/`panic!` outside tests — return `TandemError`.
- `pnpm lint` runs with `--max-warnings 0`; clippy runs with `-D warnings`.
- GitHub writes are user-only (commands/github_write.rs); agents can never post.
- Before finishing: fmt + clippy + tests + lint + typecheck + build.
