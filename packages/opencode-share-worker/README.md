# @mynameistito/opencode-share-worker

An independently deployable Cloudflare Worker for encrypted OpenCode session shares.

- R2 stores the encrypted payload.
- D1 stores the share ID, R2 object key, expiry, and lifecycle state.
- The Worker never decrypts or renders transcript contents.
- The browser decrypts locally using the key in the URL fragment.
- The viewer is a Vite-built React SPA served by the same Worker origin.

## API

- `POST /api/shares`: requires `Authorization: Bearer <SHARE_INGEST_TOKEN>`.
- `GET /api/shares/:id`: public read by non-predictable share ID; expired shares return `404`.
- `DELETE /api/shares/:id`: requires `Authorization: Bearer <SHARE_ADMIN_TOKEN>`.
- `GET /s/:id`: responsive static viewer.

JSON errors use the stable shape `{ "error": { "code": "...", "message": "..." } }`.

## Development and Deploy

```powershell
bun install --frozen-lockfile
bunx wrangler d1 migrations apply opencode-share-d1 --local --config wrangler.local.jsonc
bun run dev
```

Use `http://localhost:5173` for Vite development. The Cloudflare Vite plugin runs the Worker and local bindings in its Vite environment. For a production-like local preview:

```powershell
bun run build
bun run preview
```

Create resources and deploy with:

```powershell
bunx wrangler d1 create opencode-share-d1
bunx wrangler r2 bucket create opencode-share-r2
# Put the returned database ID and bucket name into wrangler.local.jsonc.
bunx wrangler d1 migrations apply opencode-share-d1 --remote --config wrangler.local.jsonc
bunx wrangler secret put SHARE_INGEST_TOKEN --config wrangler.local.jsonc
bunx wrangler secret put SHARE_ADMIN_TOKEN --config wrangler.local.jsonc
bunx wrangler deploy --config wrangler.local.jsonc
```

The default resource names are `opencode-share-r2` and `opencode-share-d1`. Put the D1 ID returned by `bunx wrangler d1 create` into `wrangler.local.jsonc`; keep the R2 bucket name as `opencode-share-r2` unless you chose another name. Each resource must have one unique binding: `SHARES` for R2 and `DB` for D1. Do not add duplicate `remote` entries to the file. `ALLOWED_ORIGIN` defaults to `*` for all browser origins; set it to the viewer origin for tighter CORS. The `$schema` points to Wrangler's installed `config-schema.json`, which is the canonical schema for this JSONC config. Secrets are never committed. Configure the plugin endpoint with the deployed origin. Public reads need only the ID; the AES-GCM key remains in the URL fragment.

The Worker validates JSON, content type, size, IDs, expiry, authorization, and rate limits creation. The included hourly cron trigger calls `scheduled`, which removes expired R2 objects and metadata. Creation and deletion tokens are Wrangler secrets, not JSONC values.

## Plaintext export

New shares encrypt a versioned envelope: `{ version: 2, kind: "opencode-session", exportedAt, messages }`. The viewer also accepts the existing raw `SessionMessageInfo[]` format and normalizes both at the browser boundary. Decryption, JSON parsing, and transcript rendering all happen client-side. The Worker sees only the share ID and ciphertext; URL fragments are never sent in HTTP requests.

The repository's `wrangler.local.jsonc` and `.dev.vars` are ignored. Do not commit generated `worker-configuration.d.ts`, local Wrangler state, or secrets.

## Viewer design notes

The viewer intentionally follows the original OpenCode share layout rather than presenting a dashboard: a compact shell header, a restrained session metadata row, and a narrow content column organized as a left-rail message timeline. The timeline reuses OpenCode's compact turn spacing, small role marks, muted separators, and neutral light/dark surface palette. Assistant content uses direct, safe React Markdown-like rendering with preserved newlines; fenced code and command output remain horizontally scrollable. Tool, reasoning, file, shell, and unknown content use the same compact disclosure pattern, with explicit result controls and status metadata. There are no remote assets, runtime font requests, analytics, or telemetry.

## json-render

json-render was evaluated and intentionally omitted. This application consumes one known typed transcript shape, so a direct closed renderer is smaller, easier to audit, and avoids introducing a second JSON component language. No LLM or dynamic component catalog is involved.

## Generate Tokens

Generate each token independently with Bun. This command is the same in PowerShell, `cmd.exe`, macOS, and Linux:

```text
bun -e "console.log(Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url'))"
```

Use one value for the plugin's ingest token and a different value for the Worker admin token:

```powershell
$env:OPENCODE_SHARE_INGEST_TOKEN = "paste-the-first-value-here"
bunx wrangler secret put SHARE_INGEST_TOKEN --config wrangler.local.jsonc
bunx wrangler secret put SHARE_ADMIN_TOKEN --config wrangler.local.jsonc
```

Do not put either token in `wrangler.jsonc`, `cli.json`, the repository, or a share URL. The plugin only needs the ingest token; the admin token is for manual deletion operations.

## CORS

The template allows all origins with `ALLOWED_ORIGIN: "*"`. That is convenient for a public viewer. For a tighter deployment, set it to the exact viewer origin, such as `https://shares.example.com`. Public reads remain public; bearer authorization still protects creation and deletion.

Use the Vite dev origin as the plugin `endpoint` during local development. Local D1 and R2 resources are isolated by the Cloudflare Vite environment unless remote mode is requested.
