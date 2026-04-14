# Listing Intake Portal — Implementation Spec

## Stack
- **Backend**: Cloudflare Workers, Hono, D1 (SQLite/Drizzle), Durable Objects, Queues, R2
- **Frontend**: React 18 + Vite SPA in `app/`
- **Styling**: Tailwind CSS 3 + custom shadcn/ui-style component library (`lucide-react` icons)
- **Language**: TypeScript 5.5 (strict)
- **Testing**: Vitest
- **Validation**: Zod (field, section, and business-rule tiers)

## Core Domain
- **Lead** → prospect
- **Client** → seller relationship
- **Property** → physical asset
- **ListingIntake** → workflow instance (key object)
- **ListingIntakeSection** → per-section payload
- **Document** → uploaded artifact
- **Task** → operational work unit
- **Event** → immutable audit event
- **Message** → communication log
- **ChecklistItem** → required completion logic

## State Machine

### Top-level statuses
`draft` → `invited` → `in_progress` → `submitted` → `under_review` → (`approved` | `blocked`) → `archived` | `canceled`

### Stages
1. `contact_info`
2. `property_details`
3. `ownership_disclosures`
4. `access_showings`
5. `media_condition`
6. `pricing_goals`
7. `review_submit`
8. `complete`

## Scoring
- **Completion Percent** = weighted section progress
- **Readiness Score** = `0.20*data + 0.20*validation + 0.20*docs + 0.15*review + 0.10*media + 0.10*showing + 0.05*pricing`
- **Friction Score** = risk metric for ops

## Validation Levels
1. **Field-level** — Zod schemas in `src/schemas/index.ts`
2. **Section-level** — conditional required fields (e.g., Residential requires `bedroomsTotal > 0`)
3. **Business-rule** — cross-section logic evaluated in `src/validators/engine.ts`

## Commands (DO-driven)
All commands are validated by `zIntakeCommand` at the DO boundary.
- `CreateIntake`
- `InviteSeller`
- `UpdateSection`
- `UploadDocument`
- `RunValidation`
- `SubmitIntake`
- `StartReview`
- `ApproveIntake`
- `BlockIntake`
- `RequestRevision`
- `GenerateTasks`
- `SendReminder`
- `AssignCoordinator`

## Security & Hardening
- **Auth**: Bearer-token middleware when `API_TOKEN` is configured; seller routes verify intake ownership via D1; admin routes require `agent`/`coordinator`/`admin` role.
- **Rate limiting**: Token-bucket per IP (10 RPS / burst 20).
- **Request size**: 1 MB body guard on mutating routes.
- **Upload safety**: MIME-type whitelist, 100 MB cap, and R2 head-object verification before DO registration.
- **Webhook verification**: HMAC-SHA256 signature check on both webhook endpoints when `WEBHOOK_SECRET` is set.
- **MLS credentials**: Stored in `MLS_CONNECTIONS_JSON` env/secret; looked up by `orgId`. Never accepted in request bodies.
- **DO safety**: `createIntake` wrapped in `blockConcurrencyWhile`. Terminal-status guards prevent `UpdateSection` and `UploadDocument` on `approved`/`archived`/`canceled`.
- **Idempotency**: `X-Idempotency-Key` header accepted on `POST /intakes` and `POST /admin/intakes/:id/mls/push`.

## API Surface

### Seller-facing
- `POST /intakes` — Create intake (idempotency key optional)
- `POST /intakes/:id/accept-invite`
- `GET /intakes/:id`
- `PATCH /intakes/:id/sections/:sectionKey`
- `GET /intakes/:id/documents/upload-url`
- `PUT /intakes/:id/documents/direct-upload?key=...`
- `POST /intakes/:id/documents`
- `POST /intakes/:id/submit`

### Admin / Internal
- `GET /admin/intakes?limit=&after=` — Paginated list (`{ data, nextCursor }`)
- `GET /admin/intakes/:id`
- `POST /admin/intakes/:id/assign-coordinator`
- `POST /admin/intakes/:id/start-review`
- `POST /admin/intakes/:id/approve`
- `POST /admin/intakes/:id/block`
- `POST /admin/intakes/:id/request-revision`
- `POST /admin/intakes/:id/export/reso`
- `POST /admin/intakes/:id/mls/push`

### Webhooks
- `POST /webhooks/document-extracted`
- `POST /webhooks/email-events`

## R2 Upload Flow
1. `GET /intakes/:id/documents/upload-url?documentType=&fileName=` returns `storageKey` + proxy upload URL.
2. Client `PUT /intakes/:id/documents/direct-upload?key=...` with file bytes.
3. Client `POST /intakes/:id/documents` to register the document in the DO (R2 existence is verified).

## Frontend
- **Seller form** (`app/components/IntakeForm.tsx`) — 7-section stepper with card-based layouts, live progress bar, Back/Save & Continue flow, Review & Submit checklist, and integrated document upload.
- **Admin dashboard** (`app/components/AdminDashboard.tsx`) — Stats cards, search/filter, clean data table with status badges/progress mini-bars, icon action buttons, cursor pagination, and modal dialogs for approve/block/revision/assign.
- **UI library** (`app/components/ui/`) — `Button`, `Card`, `Input`, `Label`, `Badge`, `Progress`, `Alert`, `Select`, `Checkbox`, `Separator`, `Skeleton`, `Dialog`.
- **Styling** — Tailwind CSS with custom CSS variable theming; soft sky/indigo palette; `Inter` font.

## Environment Variables / Secrets
Set via `npx wrangler secret put <NAME>` (never commit them):
- `API_TOKEN` — Bearer token for API auth (omit in local dev to disable auth)
- `WEBHOOK_SECRET` — HMAC key for webhook signature verification
- `MLS_CONNECTIONS_JSON` — JSON map of `orgId -> MLS connection config`
- `MIN_READINESS_SCORE` — optional; defaults to `60`

## Key Commands
```bash
npm run typecheck          # tsc --noEmit
npm run test               # vitest run
npm run dev                # wrangler dev
npm run deploy             # wrangler deploy
npm run build:app          # vite build app -> dist-app
```

## Deliverables for this build
1. ✅ Drizzle schema for all core tables
2. ✅ Zod schemas + shared TypeScript domain types
3. ✅ State machine transitions + event type definitions
4. ✅ Durable Object implementation for ListingIntakeDO (atomic, validated, guarded)
5. ✅ Hono API routes (seller + admin + webhooks + RESO/MLS)
6. ✅ Validation engine (field, section, business rule)
7. ✅ Scoring engine (completion, readiness, friction)
8. ✅ Modern frontend (React + Tailwind + custom shadcn/ui components)
