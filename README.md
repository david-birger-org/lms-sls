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
- `CLERK_SECRET_KEY`
- `CLERK_PUBLISHABLE_KEY`
- `CLERK_AUTHORIZED_PARTIES` (optional comma-separated origin allowlist)
- `CLERK_WEBHOOK_SECRET` or `CLERK_WEBHOOK_SIGNING_SECRET`

Database access uses Bun's native `SQL` client with `prepare: false` so it works with Supabase's transaction pooler.

## Deploy

`vercel.json` enables the Bun runtime with `bunVersion: "1.x"`.

The API surface lives under `api/monobank/*`:

- `POST /api/monobank/invoice`
- `GET /api/monobank/invoice/status`
- `GET /api/monobank/statement`
- `POST /api/clerk/webhook`

`POST /api/monobank/invoice` now expects a `clerkUserId` in the body and stores the payment in Supabase before creating the Monobank invoice. The Clerk webhook keeps `public.app_users` in sync, `public.payments.user_id` points to that local user row, and Clerk `privateMetadata` stores the local database user id plus the app role.

All `api/monobank/*` endpoints now require a valid Clerk session token and an `admin` role in Clerk `privateMetadata.role`.

Run the SQL in `supabase/schema.sql` in Supabase before calling the endpoints.

## Validate

```bash
bun run typecheck
```
