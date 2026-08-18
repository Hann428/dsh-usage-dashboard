# Contributing

Issues and pull requests are welcome when they keep the plugin small and focused on DeepSeek Harness usage visibility.

## Before Opening a Pull Request

Run the focused checks:

```bash
pnpm run typecheck
pnpm run build:client
```

Do not include API keys, full private logs, or screenshots that expose account details.

## Development Notes

- Keep credential handling on the host side.
- Keep the browser panel display-only.
- Prefer official DeepSeek endpoints and documentation over hardcoded prices when possible.
- Commit built `lib/` output when source changes, because GitHub-source installs use the repository directly.

## Bug Reports

Include the Harness version, plugin version or commit, install source, and the visible error text. Redact credentials and account identifiers before sharing logs.
