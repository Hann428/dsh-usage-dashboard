# dsh-usage-dashboard

DeepSeek usage and billing panel for DeepSeek Harness Web.

It adds a compact **Usage** tab to the conversation view. The tab shows the DeepSeek account balance, current official peak/off-peak pricing, the next price-window countdown, and a direct link to the DeepSeek platform usage page.

## Features

- Account balance from DeepSeek's official `GET /user/balance` endpoint.
- Current official prices for `deepseek-v4-flash` and `deepseek-v4-pro`.
- Peak/off-peak status based on Beijing time, with orange peak and green off-peak labels.
- Live countdown to the next peak/off-peak switch.
- Default-model highlight when the Harness default model is one of the supported DeepSeek models.
- Host-side API-key handling: the browser receives only the query result, never the key.
- Optional `dev_usage_balance` tool for agents to inspect balance and pricing data.

## Install

```bash
dsh plugin --profile web add github:Hann428/dsh-usage-dashboard
```

Restart `dsh web`, then open a conversation and select the **Usage** tab.

## Configuration

The plugin uses the standard `DEEPSEEK_API_KEY` credential reference by default.

```yaml
- id: dsh-usage-dashboard
  name: dsh-usage-dashboard
  config:
    keyRef: DEEPSEEK_API_KEY
    baseURL: https://api.deepseek.com
    platformUsageURL: https://platform.deepseek.com/usage
    timeoutMs: 10000
```

Configure the key in Harness Settings -> Models. The plugin reads the credential through the Harness credentials service.

## Notes

- DeepSeek's platform page login is separate from Harness. The "open usage page" link may require a browser login.
- The pricing table is fetched from DeepSeek's official docs at runtime so price changes are reflected after refresh.
- If the docs page cannot be reached or parsed, the balance still renders and the price row reports the pricing error.

## Development

```bash
pnpm install
pnpm run typecheck
pnpm run build:client
```

The built `lib/` files are committed so GitHub-source installs can run without a local build step.
