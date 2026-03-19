# lms-sls

Serverless Monobank endpoints for Vercel, deployed on the Bun runtime.

## Setup

```bash
bun install
```

Required environment variables:

- `MONOBANK_TOKEN`
- `INTERNAL_API_KEY`

## Deploy

`vercel.json` enables the Bun runtime with `bunVersion: "1.x"`.

The API surface lives under `api/monobank/*`:

- `POST /api/monobank/invoice`
- `GET /api/monobank/invoice/status`
- `GET /api/monobank/statement`

## Validate

```bash
bun run typecheck
```
