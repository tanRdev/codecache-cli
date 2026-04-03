# codecache-cli

Local-first CLI for storing and retrieving code snippets in a SQLite vault.

`codecache-cli` is built for humans and coding agents that need a simple local snippet database with a stable CLI, machine-friendly output, and no hosted service dependency.

## Why

- store reusable code snippets in a local SQLite database
- search across code, title, notes, description, and tags
- attach local files to snippets
- script it from agents with JSON output
- keep everything in a user-controlled local vault

## Features

- SQLite-only local vaults
- snippet create, get, list, search, update, delete
- code-aware search with FTS5
- tag support
- file attachments stored alongside the vault
- stdin support for snippet creation
- `human`, `json`, and `jsonl` output modes
- explicit `--yes` safety for destructive deletes

## Install

```bash
npm install -g codecache-cli
```

After install, the command is `cache`.

## Quick Start

Initialize a vault and save it as the default:

```bash
cache init --vault ~/codecache --set-default
```

Add a snippet from a file:

```bash
cache add src/reducer.ts --title "Reducer helper" --tag react --tag forms
```

Add a snippet from stdin:

```bash
pbpaste | cache add - --title "Clipboard snippet" --language typescript
```

Search snippets:

```bash
cache search createReducer
cache snippet list react --limit 5
```

Get a snippet:

```bash
cache get <snippet-id>
cache get <snippet-id> --raw
```

Attach a file:

```bash
cache attachment add <snippet-id> ./notes.md
cache attachment list <snippet-id>
cache attachment get <attachment-id> --output ./exported-notes.md
```

Delete safely:

```bash
cache attachment delete <attachment-id> --yes
cache rm <snippet-id> --yes
```

## Vault Model

A vault is a directory containing:

- `cache.sqlite`
- `attachments/`

Vault resolution order:

1. `--vault PATH`
2. `CACHE_CLI_VAULT`
3. saved default vault from local config

Read commands require an initialized vault. They do not create missing paths implicitly.

## Commands

```bash
cache init --vault PATH [--set-default]
cache status [--vault PATH]
cache vault show
cache vault use PATH

cache snippet create [FILE|-] --title ... [--language ...] [--tag ...]
cache snippet list [QUERY] [--tag TAG] [--limit N]
cache snippet get ID [--raw]
cache snippet update ID [FILE|-] [--title ...] [--language ...] [--tag ...]
cache snippet delete ID --yes

cache add [FILE|-] ...
cache search [QUERY] ...
cache get ID ...
cache rm ID --yes

cache tags

cache attachment add SNIPPET_ID FILE
cache attachment list SNIPPET_ID
cache attachment get ATTACHMENT_ID --output PATH
cache attachment delete ATTACHMENT_ID --yes
```

## Output Modes

- TTY default: `human`
- non-TTY default: `json`
- optional: `--format jsonl`

`cache get --raw` prints raw snippet code directly.

## Agent Usage

This CLI is designed to be agent-friendly.

Examples:

```bash
cache search "agentCacheValue" --format json
cache snippet list util --limit 10 --format json
cache get <snippet-id> --raw
```

Recommended agent patterns:

- use `--format json` for structured reads
- use `--raw` when you need only snippet code
- pass `--vault PATH` explicitly in multi-project automation

## Development

```bash
npm install
npm test
npm run typecheck
npm run build
```

## License

MIT
