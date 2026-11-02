# tandem-cli

Tandem keeps everything in one SQLite file with no server in front of
it, so "read the file" is the integration path for another script or
agent. `tandem-cli` is that path with the locations, table names and
JSON digging already done.

It opens the database **read-only**. A tool that can only read can't
corrupt a review you're in the middle of, and Tandem's WAL mode means
you don't have to close the app first.

## Getting it

Installed with the app — the Homebrew cask puts it on your PATH:

```bash
brew install --cask matthewmyrick/tap/tandem
tandem-cli paths
```

It also ships as a standalone asset on each release
(`tandem-cli-macos-arm64`, `tandem-cli-macos-x64`,
`tandem-cli-linux-x86_64`, `tandem-cli-windows-x64.exe`) for machines
without the app.

## Commands

```bash
tandem-cli paths                      # database, run logs, settings
tandem-cli prs [--repo owner/name] [--limit 50]
tandem-cli comments --repo owner/name --pr 123 [--threads]
tandem-cli summary  --repo owner/name --pr 123
tandem-cli runs [--repo owner/name] [--pr 123] [--limit 20]
```

Everything prints JSON on stdout (`--pretty` to indent), so it pipes
into `jq` or straight into another agent's context.

Global flags:

- `--db <path>` read a specific database; `$TANDEM_DB` does the same.
- `--dev` read the `make dev` store (`tandem-dev`) instead of the
  installed app's.

## Examples

Every unresolved local comment on a PR, as text an agent can read:

```bash
tandem-cli comments --repo superblocksteam/dedicated-deployment --pr 1334 \
  | jq -r '.[] | select(.status == "open") | "\(.path):\(.line) \(.author_name): \(.body)"'
```

What the agent concluded, if it wrote a summary:

```bash
tandem-cli summary --repo owner/name --pr 123 | jq -r '.body // "no summary yet"'
```

Which PRs an agent has already reviewed:

```bash
tandem-cli runs --limit 200 \
  | jq -r 'map(select(.purpose == "pr review")) | map("\(.repo_slug)#\(.pr_number)") | unique[]'
```

## Notes

- **Don't write to the database from outside.** Nothing stops you, but
  Tandem holds its own connection and emits events when data changes;
  an outside write lands silently and the app won't know. Something
  that needs to push data _in_ belongs behind a Tauri command.
- **Columns are stable; the JSON blobs grow.** Fields are added
  additively (serde defaults), and schema changes go through
  append-only migrations tracked in `PRAGMA user_version` — check that
  number if your script cares.
- Agent run logs are plain JSONL under `runs/<run_id>/events.jsonl` if
  you want what an agent _did_ rather than what it concluded.
