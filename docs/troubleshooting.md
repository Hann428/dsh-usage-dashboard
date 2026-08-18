# Troubleshooting

## Missing API Key

Configure `DEEPSEEK_API_KEY` in DeepSeek Harness Settings -> Models. The plugin uses that credential reference by default.

If you use a different credential name, set `keyRef` in the plugin config.

## Balance Fails

Check these first:

- The key is valid for DeepSeek's API.
- `baseURL` is `https://api.deepseek.com`.
- The host machine can reach DeepSeek's API.
- The API key has remaining account access and has not been rotated.

## Pricing Fails

The balance row can still render when pricing fails. Pricing is fetched from DeepSeek's official documentation at runtime so the panel can reflect price updates without a plugin release.

If pricing fails, check whether the host machine can reach the docs page and whether the docs layout changed.

## Platform Page Requires Login

The platform usage page opens in the browser and uses DeepSeek's own web session. Harness API-key configuration does not sign the browser into DeepSeek's platform.

## Plugin Does Not Appear

Restart `dsh web` after installation. If the tab still does not appear, open Harness plugin settings and confirm that `dsh-usage-dashboard` is installed in the same profile used by the web app.
