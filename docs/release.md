# Release Process

This repository is designed for GitHub-source installation by DeepSeek Harness.

## Checklist

1. Update source files under `src/`.
2. Run `pnpm run typecheck`.
3. Run `pnpm run build:client`.
4. Confirm `lib/` changed when runtime output changed.
5. Update `CHANGELOG.md`.
6. Push the release commit.

## Marketplace Notes

The awesome-dsh-plugin submission gate checks repository quality signals such as public availability, topic metadata, repository age, and commit count.

Use the `dsh-plugin` GitHub topic and keep the README install command current:

```bash
dsh plugin --profile web add github:Hann428/dsh-usage-dashboard
```

If the repository is too new, wait until it satisfies the age gate and rerun the marketplace submission.
