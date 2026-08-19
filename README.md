# dsh-usage-dashboard

DeepSeek usage and billing panel for DeepSeek Harness Web.

It adds a compact **Usage** tab to the conversation view. The tab shows the DeepSeek account balance, current official peak/off-peak pricing, the next price-window countdown, and a direct link to the DeepSeek platform usage page.

## Features

- Account balance from DeepSeek's official `GET /user/balance` endpoint.
- Current official prices for `deepseek-v4-flash` and `deepseek-v4-pro`.
- Peak/off-peak status based on Beijing time, with orange peak and green off-peak labels.
- Live countdown to the next peak/off-peak switch.
- Compact balance health light on the Usage tab label: green when usable, orange when balance is below an enabled amount or percentage warning threshold, dim neutral when both switches are off.
- Inline warning threshold switches and inputs for amount and percentage. Values are saved in browser localStorage and update the tab light immediately.
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
    healthCurrency: CNY
    alertBalance: 50
    alertBalancePercent: 20
    balancePercentBase: 100
```

Configure the key in Harness Settings -> Models. The plugin reads the credential through the Harness credentials service.

`alertBalance` and `alertBalancePercent` are optional default warning thresholds. The Usage panel also exposes inline amount and percentage fields; those browser-local values override the displayed tab light immediately. Set either threshold to `0` or leave the panel field blank to disable that check. `balancePercentBase` is the user-defined amount treated as 100% for percentage checks.

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
