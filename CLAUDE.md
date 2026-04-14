# Listing Intake Portal — Agent Notes

## Stack
- **Backend**: Cloudflare Workers, Hono, D1 (SQLite/Drizzle), Durable Objects, Queues, R2
- **Frontend**: React 18 + Vite (SPA in `app/`)
- **Language**: TypeScript 5.5 (strict)
- **Testing**: Vitest
- **Validation**: Zod

## Key Commands
```bash
npm run typecheck          # tsc --noEmit
npm run test               # vitest run
npm run dev                # wrangler dev
npm run deploy             # wrangler deploy
npm run build:app          # vite build app -> dist-app
```

## Architecture
- `src/api/index.ts` — Hono routes (seller + admin + webhooks + RESO/MLS)
- `src/durable-objects/listing-intake-do.ts` — Workflow authority DO with state machine
- `src/domains/state-machine.ts` — Pure transitions + stage advancement
- `src/validators/engine.ts` — 3-tier validation (Zod field, section rules, business rules)
- `src/export/reso.ts` — RESO Common Format payload builder
- `src/connectors/mls.ts` — RESO Web API Add/Edit adapter
- `app/components/IntakeForm.tsx` — Seller-facing SPA form
- `app/components/AdminDashboard.tsx` — Admin SPA dashboard

## Important Implementation Details
- **Money is integer cents** (`listPrice` stored in cents, exported to RESO as dollars).
- **DO state is atomic** — single `state` snapshot in `ctx.storage` (fixed from multi-key write).
- **Checklist gate** — `areRequiredTasksComplete()` returns `false` if checklist is empty.
- **Role propagation** — API routes translate `actorType` to `role` in `_meta` before sending to DO.
- **CORS enabled** on all API routes.
- **Request size limit** — 1 MB body guard middleware.
- **Webhook signature verification** — `X-Webhook-Signature` HMAC-SHA256 when `WEBHOOK_SECRET` is set.
- **R2 upload flow**:
  1. `GET /intakes/:id/documents/upload-url` returns `storageKey` + proxy upload URL
  2. Client `PUT /intakes/:id/documents/direct-upload?key=...` with file bytes
  3. Client `POST /intakes/:id/documents` to register the document in the DO

## Frontend Form Gotchas
- Form fields are strings in React state; `coerceNumber()` converts empty strings to `undefined` before sending to API.
- The form hydrates existing section payloads from the DO on load.

## Deployment
- Worker deploys via `wrangler.jsonc`
- Frontend builds to `dist-app/` via Vite. Host it on Cloudflare Pages (or serve from Worker if desired).
- `wrangler.jsonc` has `<your-database-id>` placeholder for D1.

## Security Audit Notes
See `AUDIT_SECURITY.md` for full report. Remaining gaps (non-blocking for MVP):
- No JWT/session middleware yet (roles are hardcoded by route).
- MLS credentials are passed per-request in `/mls/push` (intended for MVP; rotate secrets via env in v2).

## RESO Compliance
See `RESO_COMPLIANCE_REPORT.md`. MVP gaps addressed:
- RESO-aligned schema columns added
- `buildRESOPropertyPayload()` generates RCF JSON with `@reso.context`
- `PropertyType` mapped correctly (`commercial` -> `Commercial Sale`)
- `Media[]` exported for all document types

## Adding a New Section
1. Add Zod schema in `src/schemas/index.ts` (optional)
2. Add discriminated-union branch in `src/api/index.ts` (`zUpdateSectionPayload`)
3. Add `case` in DO `updateSection()` if schema validation is needed
4. Add UI in `app/components/IntakeForm.tsx`
5. Add tests in `src/validators/engine.test.ts` if business rules apply
