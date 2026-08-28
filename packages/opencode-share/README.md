# @mynameistito/opencode-share

A self-hosted OpenCode V2 TUI plugin that encrypts session transcripts locally and uploads only ciphertext to your Worker.

## How It Works

1. The plugin gets the active session ID from the TUI prompt-footer slot.
2. It reads the beta's typed session messages and redacts sensitive-looking fields when `sanitize` is enabled.
3. It encrypts the serialized export with a randomly generated AES-GCM-256 key and IV.
4. It sends the ciphertext, IV, random share ID, and expiry to `POST /api/shares`.
5. It copies `https://host/s/<id>#<key>` through terminal OSC 52.

The key is only in the URL fragment. Browsers do not send fragments to servers, so the Worker and R2 cannot decrypt the share.

## Install and configure

```powershell
opencode2 plugin add "@mynameistito/opencode-share@latest" -g
$env:OPENCODE_SHARE_INGEST_TOKEN = "replace-with-a-secret"
```

Add the Worker URL and non-secret options to `~/.config/opencode/cli.json`:

```jsonc
{
  "$schema": "https://opencode.ai/v2/cli.json",
  "plugins": [
    {
      "package": "@mynameistito/opencode-share@latest",
      "options": {
        "endpoint": "https://shares.example.workers.dev",
        "tokenEnv": "OPENCODE_SHARE_INGEST_TOKEN",
        "defaultExpiry": "7d",
        "sanitize": true,
        "maxPayloadBytes": 5242880,
      },
    },
  ],
}
```

Use `/oshare`, the command palette, or `<leader>h`. OpenCode reserves `/share` for its built-in sharing command. The token is read from `tokenEnv`; never put it in `cli.json`. The default keyboard binding is intentionally a plugin command binding and does not replace an OpenCode default.

## Options

- `endpoint`: Worker origin, for example `https://shares.example.workers.dev`.
- `tokenEnv`: Environment variable containing the ingest token. Defaults to `OPENCODE_SHARE_INGEST_TOKEN`.
- `defaultExpiry`: Duration such as `1h`, `7d`, or `31d`. The accepted range is one minute through 31 days.
- `sanitize`: Redact fields whose names look like tokens, secrets, passwords, API keys, cookies, or authorization values. Defaults to `true`.
- `maxPayloadBytes`: Maximum serialized plaintext size checked before encryption. Defaults to 5 MiB.

The Worker independently validates its own maximum request size and expiry rules.

## Environment

PowerShell:

```powershell
$env:OPENCODE_SHARE_INGEST_TOKEN = "your-ingest-secret"
```

POSIX shells:

```sh
export OPENCODE_SHARE_INGEST_TOKEN='your-ingest-secret'
```

## Beta limitation

The installed `@opencode-ai/plugin` beta currently has no documented or typed `session.export` API and no clipboard API. The plugin uses the beta's typed `context.data.session.message.list()` as an explicit fallback, sanitizes the resulting message data, and encrypts it locally. This is a beta-specific adapter, not a promise that the derived shape matches the future canonical export. URL copying uses terminal OSC 52; terminals that disable OSC 52 will not update their clipboard.

## Security Notes

- The ingest token authorizes uploads but is never included in the share URL.
- The Worker does not decrypt, inspect, or render transcript contents.
- Anyone with the complete URL can read the share until it expires. Treat the URL as a bearer secret.
- Do not log the URL, key, token, or plaintext transcript.
