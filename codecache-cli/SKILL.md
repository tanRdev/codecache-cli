---
name: codecache-cli
description: Use when an agent needs to store, retrieve, search, update, or attach local code snippets through the `cache` CLI from the `codecache-cli` package. Triggers include requests to save reusable code, search a local snippet vault, keep agent memory in a local SQLite database, attach notes or files to snippets, bootstrap a vault, or automate snippet workflows with `cache add`, `cache search`, `cache get`, `cache snippet`, `cache attachment`, `cache status`, or `cache vault`.
---

# codecache-cli

Use `cache` as a local-first snippet database for coding agents. Prefer it when the user wants reusable local memory without a hosted service.

## Quick Start

1. Confirm the CLI exists with `cache help` or `command -v cache`.
2. Resolve the vault path.
3. If the vault is missing, initialize it with `cache init --vault PATH --set-default`.
4. Prefer explicit `--vault PATH` in automation, even if a default vault exists.
5. Use JSON output for machine reads and `--raw` when only snippet code is needed.

## Vault Workflow

### Create or select a vault

```bash
cache init --vault ~/codecache --set-default
cache status --vault ~/codecache
cache vault show
cache vault use ~/codecache
```

Rules:

- Read commands require an initialized vault.
- Do not assume a missing path will be created by read commands.
- In multi-project automation, pass `--vault PATH` explicitly.

## Core Commands

### Add snippets

From a file:

```bash
cache add src/example.ts --vault ~/codecache --title "Example helper" --tag util --tag typescript
```

From stdin:

```bash
pbpaste | cache add - --vault ~/codecache --title "Clipboard snippet" --language typescript
```

### Search snippets

```bash
cache search createReducer --vault ~/codecache --format json
cache snippet list react --vault ~/codecache --limit 5 --format json
```

Search matches:

- title
- description
- notes
- code
- tags

### Retrieve snippets

Structured read:

```bash
cache get <snippet-id> --vault ~/codecache --format json
```

Raw code only:

```bash
cache get <snippet-id> --vault ~/codecache --raw
```

### Update snippets

```bash
cache snippet update <snippet-id> src/example.ts --vault ~/codecache --title "Updated helper" --tag refined
```

### Delete snippets

```bash
cache rm <snippet-id> --vault ~/codecache --yes
```

Deletion is intentionally guarded. Always pass `--yes` for destructive commands.

## Attachments

Add an attachment:

```bash
cache attachment add <snippet-id> ./notes.md --vault ~/codecache
```

List attachments:

```bash
cache attachment list <snippet-id> --vault ~/codecache --format json
```

Export an attachment:

```bash
cache attachment get <attachment-id> --vault ~/codecache --output ./exported-notes.md
```

Delete an attachment:

```bash
cache attachment delete <attachment-id> --vault ~/codecache --yes
```

## Output Rules

- Default TTY output is `human`.
- Default non-TTY output is `json`.
- Use `--format json` for machine-readable list and object reads.
- Use `--format jsonl` for streaming list-like processing.
- Use `--raw` when only snippet code should be returned.

## Recommended Agent Patterns

### Save reusable code during implementation

When you produce a piece of code likely to be reused later, store it immediately:

```bash
cache add path/to/file.ts --vault PATH --title "Short clear title" --tag project-name --tag domain
```

### Search before reinventing

Before implementing a helper, search the local vault:

```bash
cache search "query terms" --vault PATH --format json
```

### Pull exact code into context

When a snippet looks relevant, fetch only the code:

```bash
cache get <snippet-id> --vault PATH --raw
```

### Keep notes alongside snippets

Use `description`, `notes`, tags, or attachments to store context that will help later retrieval.

## Safety Rules

- Do not omit `--yes` on destructive commands.
- Do not assume a vault exists; verify with `cache status --vault PATH`.
- Treat `io_error` as an environment or filesystem problem, not a CLI logic bug.
- Treat `validation_error` as incorrect input or missing arguments.
- Prefer explicit paths when operating in temporary workspaces, CI, or agent sandboxes.

## Troubleshooting

### Vault is not initialized

Run:

```bash
cache init --vault PATH --set-default
```

### Missing source file or output path failure

Check the filesystem path first. The CLI reports these as `io_error`.

### Empty search results

Try:

- fewer terms
- symbol names from the code
- known tags
- `cache snippet list --limit 20 --format json`

## Response Shape

When using this skill, prefer to report:

1. the exact `cache` command you ran
2. the vault path used
3. the snippet id or attachment id created or retrieved
4. any `validation_error`, `not_found`, or `io_error` exactly as returned
