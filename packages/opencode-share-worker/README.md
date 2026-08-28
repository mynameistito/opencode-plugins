# @mynameistito/opencode-share-worker

An independently deployable Cloudflare Worker for encrypted OpenCode session shares.

- R2 stores the encrypted payload.
- D1 stores the share ID, R2 object key, expiry, and lifecycle state.
- The Worker never decrypts or renders transcript contents.
- The browser decrypts locally using the key in the URL fragment.

## API

- `POST /api/shares`: requires `Authorization: Bearer <SHARE_INGEST_TOKEN>`.
- `GET /api/shares/:id`: public read by non-predictable share ID; expired shares return `404`.
- `DELETE /api/shares/:id`: requires `Authorization: Bearer <SHARE_ADMIN_TOKEN>`.
- `GET /s/:id`: responsive static viewer.

JSON errors use the stable shape `{ "error": { "code": "...", "message": "..." } }`.

## Deploy

```powershell
bun install --frozen-lockfile
Copy-Item wrangler.jsonc wrangler.local.jsonc
wrangler d1 create opencode-share-d1
wrangler r2 bucket create opencode-share-r2
# Put the returned database ID and bucket name into wrangler.local.jsonc.
wrangler d1 migrations apply opencode-share --remote --config wrangler.local.jsonc
wrangler secret put SHARE_INGEST_TOKEN --config wrangler.local.jsonc
wrangler secret put SHARE_ADMIN_TOKEN --config wrangler.local.jsonc
wrangler deploy --config wrangler.local.jsonc
```

The default resource names are `opencode-share-r2` and `opencode-share-d1`. Put the D1 ID returned by `wrangler d1 create` into `wrangler.local.jsonc`; keep the R2 bucket name as `opencode-share-r2` unless you chose another name. Each resource must have one unique binding: `SHARES` for R2 and `DB` for D1. Do not add duplicate `remote` entries to the file. `ALLOWED_ORIGIN` defaults to `*` for all browser origins; set it to the viewer origin for tighter CORS. The `$schema` points to Wrangler's installed `config-schema.json`, which is the canonical schema for this JSONC config. Secrets are never committed. Configure the plugin endpoint with the deployed origin. Public reads need only the ID; the AES-GCM key remains in the URL fragment.

The Worker validates JSON, content type, size, IDs, expiry, authorization, and rate limits creation. The included hourly cron trigger calls `scheduled`, which removes expired R2 objects and metadata. Creation and deletion tokens are Wrangler secrets, not JSONC values.

## CORS

The template allows all origins with `ALLOWED_ORIGIN: "*"`. That is convenient for a public viewer. For a tighter deployment, set it to the exact viewer origin, such as `https://shares.example.com`. Public reads remain public; bearer authorization still protects creation and deletion.

## Local Development

Run the Worker from this package with:

```powershell
wrangler dev --config wrangler.local.jsonc
```

Use the resulting origin as the plugin `endpoint`. Local D1 and R2 resources are isolated by Wrangler unless remote mode is requested.
