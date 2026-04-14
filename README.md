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
3. (Optional) Set `WEBHOOK_SECRET` in Worker secrets for webhook HMAC verification.

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

## RESO / MLS Compliance

See `RESO_COMPLIANCE_REPORT.md` for alignment with RESO Data Dictionary 2.0 and Web API Add/Edit (RCP-010).

## License

MIT
