# Privacy

This plugin keeps credential access on the Harness host side.

## Data Flow

- The browser panel calls the local Harness route exposed by this plugin.
- The host route resolves the `DEEPSEEK_API_KEY` credential reference through Harness.
- The host route calls DeepSeek's balance endpoint and official pricing page.
- The browser receives only the balance, pricing, status, and error fields needed for display.

The raw API key is not serialized into the browser bundle, browser state, or panel response.

## Network Requests

The plugin performs these outbound requests from the Harness host process:

- `GET https://api.deepseek.com/user/balance`
- DeepSeek official pricing documentation, used to reflect current token prices

The "open usage page" link only navigates the user's browser to DeepSeek's platform page. That page may require its own login session.

## Logs

The plugin avoids logging credentials. If you share logs in an issue, remove API keys, account identifiers, and screenshots that expose private account information.
