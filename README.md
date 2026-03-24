# lms-sls

Serverless Monobank endpoints for Vercel, deployed on the Bun runtime.

## Setup

```bash
bun install
```

Run locally with Vercel's function dev server:

```bash
bun run dev:vercel
```

That serves the functions on `http://localhost:3001`.

Required environment variables:

- `MONOBANK_TOKEN`
- `DATABASE_URL` (Supabase transaction pooler connection string)
- `INTERNAL_API_KEY`

Database access uses Bun's native `SQL` client with `prepare: false` so it works with Supabase's transaction pooler.

## Deploy

`vercel.json` enables the Bun runtime with `bunVersion: "1.x"`.

The API surface lives under `api/monobank/*`:

- `POST /api/monobank/invoice`
- `GET /api/monobank/invoice/status`
- `GET /api/monobank/statement`

`lms-admin` now owns Better Auth completely. `lms-sls` only accepts trusted server-to-server requests from the admin app. `POST /api/monobank/invoice` stores the payment in Supabase before creating the Monobank invoice. Send an `Idempotency-Key` header to make retries safe; repeated requests with the same key reuse the existing payment row and invoice state.

All `api/monobank/*` endpoints require the trusted internal API key plus forwarded admin identity headers from `lms-admin`.

Run `supabase/schema.sql` for a fresh setup, or apply the SQL files in `supabase/migrations/` to update an existing database.

Payment rows now use a normalized internal status enum and store the raw provider status separately.

## Validate

```bash
bun run typecheck
bun test
```
