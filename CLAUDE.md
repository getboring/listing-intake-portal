# Listing Intake Portal — Agent Notes

## Stack
- **Backend**: Cloudflare Workers, Hono, D1 (SQLite/Drizzle), Durable Objects, Queues, R2
- **Frontend**: React 18 + Vite (SPA in `app/`)
- **Styling**: Tailwind CSS 3 + custom shadcn/ui-style component library
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
- `app/components/IntakeForm.tsx` — Seller-facing SPA form (stepper + cards)
- `app/components/AdminDashboard.tsx` — Admin SPA dashboard (stats + data table)
- `app/components/ui/` — Lightweight shadcn/ui-style components (Button, Card, Input, Badge, Progress, Alert, Select, Checkbox, Separator, Skeleton)

## Design System
- **Aesthetic**: Light, friendly, professional, native
- **Primary palette**: Sky / Indigo
- **Accent**: Soft teal for positive states
- **Background**: White cards on a subtle gradient (`bg-gradient-to-br from-sky-50 to-indigo-50` for seller, `bg-slate-50` for admin)
- **Typography**: Inter (Google Fonts) with tight tracking on headings
- **Radius**: `0.75rem` on cards, `0.5rem` on inputs/buttons
- **Shadows**: Soft diffused shadows (`shadow-xl shadow-black/5`)

## Important Implementation Details
- **Money is integer cents** (`listPrice` stored in cents, exported to RESO as dollars).
- **DO state is atomic** — single `state` snapshot in `ctx.storage` (fixed from multi-key write).
- **Checklist gate** — `areRequiredTasksComplete()` returns `false` if checklist is empty.
- **Role propagation** — API routes translate `actorType` to `role` in `_meta` before sending to DO.
- **CORS enabled** on all API routes.
- **Request size limit** — 1 MB body guard middleware.
- **Rate limiting** — token-bucket per IP (10 RPS, burst 20).
- **Auth middleware** — `API_TOKEN` Bearer token required when set; seller routes verify intake ownership via D1; admin routes require `agent`/`coordinator`/`admin` role.
- **Webhook signature verification** — `X-Webhook-Signature` HMAC-SHA256 when `WEBHOOK_SECRET` is set.
- **MLS credentials** — stored in `MLS_CONNECTIONS_JSON` env/secret; looked up by `orgId`. Never accepted in request bodies.
- **R2 upload flow**:
  1. `GET /intakes/:id/documents/upload-url` returns `storageKey` + proxy upload URL
  2. Client `PUT /intakes/:id/documents/direct-upload?key=...` with file bytes (MIME-type whitelisted)
  3. Client `POST /intakes/:id/documents` to register the document in the DO (R2 existence verified)
- **DO command validation** — all commands entering the DO are validated with Zod (`zIntakeCommand`); no `as` casts remain.
- **DO concurrency guard** — `createIntake` is wrapped in `blockConcurrencyWhile`.
- **DO terminal-status guards** — `UpdateSection` and `UploadDocument` are rejected for `approved`/`archived`/`canceled` intakes.
- **Idempotency** — `X-Idempotency-Key` header accepted on `createIntake` and `mls/push` (best-effort enforcement).
- **RESO export** includes `SourceSystemName`, `SourceSystemKey`, `DaysOnMarket`, and `CumulativeDaysOnMarket`.

## Frontend Form Gotchas
- Form fields are strings in React state; `coerceNumber()` converts empty strings to `undefined` before sending to API.
- The form hydrates existing section payloads from the DO on load.
- Admin dashboard enforces client-side length caps on prompt inputs (block reason, notes).
- UI components live in `app/components/ui/` and use Tailwind + `cn()` utility.
- The `~` alias in the app resolves to the `app/` directory via Vite config.

## Deployment
- Worker deploys via `wrangler.jsonc`
- Frontend builds to `dist-app/` via Vite. Host it on Cloudflare Pages (or serve from Worker if desired).
- `wrangler.jsonc` has `<your-database-id>` placeholder for D1.

## Environment Variables / Secrets
Set these via `npx wrangler secret put <NAME>` (never commit them):
- `API_TOKEN` — Bearer token for API auth (omit in local dev to disable auth)
- `WEBHOOK_SECRET` — HMAC key for webhook signature verification
- `MLS_CONNECTIONS_JSON` — JSON map of `orgId -> { baseUrl, resourceName, clientId, clientSecret, tokenEndpoint, scope? }`
- `MIN_READINESS_SCORE` — optional; defaults to `60`

## Security Audit Notes
See `AUDIT_SECURITY.md` and `AUDIT_BREAK_IT.md` for original reports. All critical/high findings have been remediated.

## RESO Compliance
See `RESO_COMPLIANCE_REPORT.md`. MVP gaps addressed:
- RESO-aligned schema columns added
- `buildRESOPropertyPayload()` generates RCF JSON with `@reso.context`
- `PropertyType` mapped correctly (`commercial` -> `Commercial Sale`)
- `Media[]` exported for all document types
- `SourceSystemName` / `SourceSystemKey` included
- `DaysOnMarket` / `CumulativeDaysOnMarket` computed from `listingContractDate`

## Adding a New Section
1. Add Zod schema in `src/schemas/index.ts`
2. Add discriminated-union branch in `src/api/index.ts` (`zUpdateSectionPayload`)
3. Add `case` in DO `updateSection()` for schema validation
4. Add UI in `app/components/IntakeForm.tsx` under the appropriate section block
5. Add tests in `src/validators/engine.test.ts` if business rules apply
