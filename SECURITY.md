# Security

Do not open public issues with API keys, credentials, account screenshots that reveal private identifiers, or full Harness logs.

This plugin resolves `DEEPSEEK_API_KEY` through the Harness credentials service on the host side. The browser panel receives only the balance/pricing response and never receives the raw key.

If you suspect a credential leak, rotate the affected DeepSeek key first, then open an issue with the sensitive values removed.
