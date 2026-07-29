# codecache-cli (deprecated)

This standalone CLI has been archived. Active development moved to the public
[CodeCache monorepo](https://github.com/tanRdev/codecache), which now contains
the CLI, browser app, API, product site, and documentation.

Install the current CLI:

```bash
npm install --global https://github.com/tanRdev/codecache/releases/latest/download/codecache-cli.tgz
```

Then start a new local library:

```bash
cache init
```

## Existing vaults

The `0.1.x` vault format in this repository is different from the current
CodeCache profile and storage format. Existing vaults are not migrated
automatically. Keep a backup of the entire vault directory, including
`cache.sqlite` and `attachments/`, before trying a newer release.

The source and historical releases remain available for existing users, but
this repository no longer receives features or fixes. Please open new issues in
[tanRdev/codecache](https://github.com/tanRdev/codecache/issues).
