# Listing Intake Portal

A full-stack listing intake workflow for real estate. Sellers complete a guided form; coordinators review, approve, and push to MLS via RESO standards.

## Quick Start

```bash
npm install
npm run typecheck
npm run test
npm run dev
```

## Project Structure

```
app/                 # Vite React SPA
  components/
    IntakeForm.tsx
    AdminDashboard.tsx
src/                 # Cloudflare Worker backend
  api/               # Hono routes
  connectors/        # MLS adapters
  db/                # Drizzle schema
  domains/           # State machine, commands, types
  durable-objects/   # ListingIntakeDO
  events/            # Domain event types
  export/            # RESO payload builder
  lib/               # Scoring, env
  validators/        # Validation engine
  index.ts           # Worker entry
drizzle.config.ts
wrangler.jsonc
```

## Environment Setup

1. Copy `wrangler.jsonc` and set your D1 database ID.
2. Run migrations:
   ```bash
   npx wrangler d1 migrations apply listing-intake-db --local
   ```
3. Set secrets (never commit these):
   ```bash
   npx wrangler secret put API_TOKEN
   npx wrangler secret put WEBHOOK_SECRET
   npx wrangler secret put MLS_CONNECTIONS_JSON
   ```
   - `API_TOKEN` — Bearer token for API authentication (omit in local dev to skip auth)
   - `WEBHOOK_SECRET` — HMAC-SHA256 key for webhook signature verification
   - `MLS_CONNECTIONS_JSON` — JSON map of `orgId -> MLS connection config`:
     ```json
     {
       "org-id-uuid": {
         "baseUrl": "https://api.mlsprovider.com/",
         "resourceName": "Property",
         "clientId": "your-client-id",
         "clientSecret": "your-client-secret",
         "tokenEndpoint": "https://auth.mlsprovider.com/token",
         "scope": "api"
       }
     }
     ```

## Running Tests

```bash
npm run test
```

## Deployment

### Worker (API)
```bash
npm run deploy
```

### Frontend
```bash
npm run build:app
```
Deploy `dist-app/` to Cloudflare Pages or serve via the Worker.

## Security & Operations

- **Auth**: Bearer-token middleware when `API_TOKEN` is configured; seller routes verify intake ownership; admin routes require `agent`/`coordinator`/`admin` role.
- **Rate limiting**: Token-bucket per IP (10 RPS, burst 20).
- **Upload safety**: MIME-type whitelist and R2 existence check before document registration.
- **Webhook verification**: HMAC-SHA256 signature check on `/webhooks/document-extracted` and `/webhooks/email-events` when `WEBHOOK_SECRET` is set.
- **Idempotency**: Pass `X-Idempotency-Key` on `POST /intakes` and `POST /admin/intakes/:id/mls/push`.

## RESO / MLS Compliance

See `RESO_COMPLIANCE_REPORT.md` for alignment with RESO Data Dictionary 2.0 and Web API Add/Edit (RCP-010).

## License

MIT
