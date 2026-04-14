# Listing Intake Portal - Implementation Spec

## Stack
- TypeScript on Cloudflare Workers
- D1 (Drizzle ORM)
- Durable Objects for intake state authority
- Hono for API routing
- R2 for document storage
- Zod for validation

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
- **Readiness Score** = 0.20*data + 0.20*validation + 0.20*docs + 0.15*review + 0.10*media + 0.10*showing + 0.05*pricing
- **Friction Score** = risk metric for ops

## Validation Levels
1. Field-level (Zod)
2. Section-level (conditional required fields)
3. Business-rule (cross-section logic, blocking/non-blocking)

## Commands (DO-driven)
- `CreateIntake`
- `InviteSeller`
- `UpdateSection`
- `UploadDocument`
- `RunValidation`
- `SubmitIntake`
- `ApproveIntake`
- `BlockIntake`
- `GenerateTasks`
- `SendReminder`
- `AssignCoordinator`

## Security
- Seller auth via magic link + session token
- Internal auth via SSO/standard auth
- RBAC: seller, agent, coordinator, admin
- Signed URLs for file access
- SHA-256 checksums, audit logs

## API Surface
### Seller-facing
- POST /intakes/:id/accept-invite
- GET /intakes/:id
- PATCH /intakes/:id/sections/:sectionKey
- POST /intakes/:id/documents
- POST /intakes/:id/submit

### Internal
- GET /admin/intakes
- GET /admin/intakes/:id
- POST /admin/intakes/:id/assign
- POST /admin/intakes/:id/approve
- POST /admin/intakes/:id/block
- POST /admin/intakes/:id/request-revision

### Webhooks
- POST /webhooks/document-extracted
- POST /webhooks/email-events

## Deliverables for this build
1. Drizzle schema for all core tables
2. Zod schemas + shared TypeScript domain types
3. State machine transitions + event type definitions
4. Durable Object implementation for ListingIntakeDO
5. Hono API routes (seller + internal)
6. Validation engine (field, section, business rule)
7. Scoring engine (completion, readiness, friction)
8. Frontend form shell (React + TanStack Form + Zod)
