# BREAK-IT AUDIT: Listing Intake Portal

**Auditor:** Destructive QA / Systems Architecture  
**Date:** 2026-04-13  
**Scope:** All source files in `/src` + `/app` + API surface  

---

## Executive Summary

This audit found **24 issues** across 6 attack vectors. The most severe finding is that the `Approve` and `Block` admin features are **completely non-functional** due to a missing `role` field in command metadata. Additionally, intakes that reach `submitted` status are **permanently stuck** because there is no API route to advance them to `under_review`.

---

## 1. State Machine Abuse

### Issue 1.1: Approval is impossible — `role` is never sent to the DO
- **Category:** State Machine Abuse
- **Severity:** CRITICAL
- **Reproduction:** `POST /admin/intakes/:id/approve` with any valid intake in `under_review`.
- **Impact:** No intake can ever be approved. The `ApproveIntake` command sets `_meta: { actorType: "coordinator" }` but omits `role`. The state machine checks `reviewerRoles.has(context.role)` where `role === undefined`, which returns `false`.
- **Fix:** Add `role: "coordinator"` (or derive from auth token) to all admin command bodies sent to the DO.

### Issue 1.2: Blocking is impossible for the same reason
- **Category:** State Machine Abuse
- **Severity:** CRITICAL
- **Reproduction:** `POST /admin/intakes/:id/block` with any valid intake in `under_review`.
- **Impact:** Block operation always fails because `reviewerRoles.has(undefined)` is `false`.
- **Fix:** Same as Issue 1.1 — populate `_meta.role` in the API layer.

### Issue 1.3: Intakes get stuck in `submitted` forever
- **Category:** State Machine Abuse
- **Severity:** CRITICAL
- **Reproduction:** Seller calls `POST /intakes/:id/submit`. Intake moves to `submitted`. There is no admin route to transition to `under_review`.
- **Impact:** Workflow deadlock. Since `approved` and `blocked` can only be reached from `under_review` (not `submitted`), the intake can never be approved or blocked.
- **Fix:** Add `POST /admin/intakes/:id/start-review` that emits a `StartReview` command transitioning `submitted` → `under_review`.

### Issue 1.4: Empty checklist auto-satisfies task completion
- **Category:** State Machine Abuse
- **Severity:** HIGH
- **Reproduction:** Create an intake, submit it, move to `under_review` (once fixed), then approve with `readinessScore >= 60` and **zero checklist items**.
- **Impact:** `areRequiredTasksComplete()` iterates `this.checklist.values()`. If the map is empty, it returns `true`. An intake with no tasks is approvable.
- **Fix:** Require at least one checklist item for approval, or seed default checklist items on intake creation/submission.

### Issue 1.5: `readinessScore` boundary at 60 is fragile
- **Category:** State Machine Abuse
- **Severity:** MEDIUM
- **Reproduction:** Score = 59 → blocked from approval. Score = 60 → allowed. This is by design but the threshold is arbitrary and undocumented.
- **Impact:** Ops teams have no guidance on why 60 is the magic number. No audit log of threshold changes.
- **Fix:** Externalize `MIN_READINESS_SCORE` to an environment variable and document it.

### Issue 1.6: No status check on `updateSection` after approval
- **Category:** State Machine Abuse
- **Severity:** MEDIUM
- **Reproduction:** After an intake is `approved`, call `PATCH /intakes/:id/sections/property_details` with new data.
- **Impact:** The DO's `updateSection` does not check `this.status`. Sellers can mutate data on already-approved intakes, causing post-approval drift.
- **Fix:** Reject `UpdateSection` if `status` is `approved`, `archived`, or `canceled`.

### Issue 1.7: No status check on `uploadDocument` after approval
- **Category:** State Machine Abuse
- **Severity:** MEDIUM
- **Reproduction:** `POST /intakes/:id/documents` on an `approved` intake.
- **Impact:** Documents can be uploaded to closed intakes, inflating storage and breaking audit boundaries.
- **Fix:** Reject `UploadDocument` for terminal statuses.

---

## 2. Data Corruption

### Issue 2.1: `createIntake` is not idempotent — calling it twice resets the DO
- **Category:** Data Corruption
- **Severity:** HIGH
- **Reproduction:** Send two `CreateIntake` commands to the same DO stub.
- **Impact:** The DO overwrites `intakeId`, `orgId`, and status with a brand-new UUID, orphaning the previous intake record in D1.
- **Fix:** Check `this.intakeId` in `createIntake`. If already set, return an idempotency error or the existing ID.

### Issue 2.2: `assignCoordinator` accepts empty string at DO layer
- **Category:** Data Corruption
- **Severity:** MEDIUM
- **Reproduction:** Bypass the API and send `AssignCoordinator` with `coordinatorId: ""` directly to the DO.
- **Impact:** The DO's `fetch()` validates `typeof body.coordinatorId !== "string"` but allows empty string. Coordinator is silently cleared.
- **Fix:** Add `body.coordinatorId.trim().length === 0` check in the DO.

### Issue 2.3: `blockIntake` accepts empty reason at DO layer
- **Category:** Data Corruption
- **Severity:** MEDIUM
- **Reproduction:** Bypass API and send `BlockIntake` with `reason: ""` directly to DO.
- **Impact:** Block event is emitted with an empty reason, making audit trails useless.
- **Fix:** Add `body.reason.trim().length === 0` check in the DO.

### Issue 2.4: DO `persist()` is non-atomic
- **Category:** Data Corruption
- **Severity:** HIGH
- **Reproduction:** Trigger a DO eviction or exception between two `storage.put` calls during `persist()`.
- **Impact:** Partial write leaves the DO in an inconsistent state (e.g., new status written but old sections).
- **Fix:** Write a single atomic object: `await this.ctx.storage.put("state", { ... })` instead of 9 separate keys.

### Issue 2.5: DO `load()` is vulnerable to partial-state corruption
- **Category:** Data Corruption
- **Severity:** HIGH
- **Reproduction:** Same as 2.4 — if a previous `persist()` partially failed, `load()` reconstructs a Franken-state.
- **Impact:** Status and sections can be from different logical versions, leading to unpredictable transitions.
- **Fix:** Same as 2.4 — single-key atomic storage.

---

## 3. API Abuse

### Issue 3.1: No request body size limits
- **Category:** API Abuse
- **Severity:** MEDIUM
- **Reproduction:** `POST /intakes/:id/accept-invite` with a 50MB JSON body containing a 10MB `sellerEmail` string.
- **Impact:** Worker memory exhaustion, potential DoS. Cloudflare Workers limit is ~100MB but there's no app-level enforcement.
- **Fix:** Add a Hono middleware that rejects bodies over a configurable size (e.g., 1MB).

### Issue 3.2: `fileSizeBytes` negative / absurd values bypass DO validation
- **Category:** API Abuse
- **Severity:** MEDIUM
- **Reproduction:** The API validates `nonnegative()`, but the DO only checks `typeof body.fileSizeBytes !== "number"`. Bypass the API to send `-1` or `9e18`.
- **Impact:** Corrupts the event log and could overflow the `bigint` blob column in SQLite.
- **Fix:** Add `Number.isFinite(body.fileSizeBytes) && body.fileSizeBytes >= 0 && body.fileSizeBytes <= MAX_FILE_SIZE` in the DO.

### Issue 3.3: `sellerEmail` length unbounded at DO layer
- **Category:** API Abuse
- **Severity:** MEDIUM
- **Reproduction:** Send `InviteSeller` directly to DO with a 1-million-character `sellerEmail`.
- **Impact:** Storage bloat, potential DoS on downstream email providers.
- **Fix:** Add max-length validation (e.g., 254 chars per RFC 5321) in the DO.

### Issue 3.4: `sectionKey` is injected into command payload without length limits
- **Category:** API Abuse
- **Severity:** LOW
- **Reproduction:** While SQL injection is mitigated by Drizzle parameterization, a `sectionKey` like `"'; DROP TABLE--"` is logged and returned in error messages.
- **Impact:** Could pollute logs or trigger XSS if error messages are rendered unescaped in the frontend.
- **Fix:** Sanitize `sectionKey` before logging; add strict regex whitelist (`/^[a-z_]+$/`).

### Issue 3.5: Unhandled promise rejections in API routes
- **Category:** API Abuse
- **Severity:** HIGH
- **Reproduction:** Call `GET /intakes/:id` where the DO namespace binding is misconfigured or the DO throws.
- **Impact:** Unhandled exception crashes the request with a generic 500 and leaks no actionable error to the client. In Workers, this can trigger error-rate alerts.
- **Fix:** Wrap all async route handlers in `try/catch` and return structured error responses.

### Issue 3.6: No authentication middleware — anyone can approve
- **Category:** API Abuse
- **Severity:** CRITICAL
- **Reproduction:** `curl -X POST /admin/intakes/:id/approve` with no auth headers.
- **Impact:** Complete authorization bypass. The API hardcodes `actorType: "coordinator"` without verifying the caller's identity.
- **Fix:** Implement an auth middleware (e.g., JWT or Cloudflare Access) and derive `actorType` / `role` from the authenticated user.

---

## 4. Business Logic Gaps

### Issue 4.1: `targetListDate` boundary is timezone-sensitive and imprecise
- **Category:** Business Logic Gaps
- **Severity:** MEDIUM
- **Reproduction:** Set `targetListDate` to exactly 3 days from now at 23:59 local time but 00:00 UTC. `Math.ceil` can produce different `diffDays` depending on when `new Date()` is evaluated.
- **Impact:** A listing that is 3 days away might incorrectly trigger (or miss) the "within 3 days" warning.
- **Fix:** Use `date-fns` differenceInCalendarDays with explicit timezone handling, or store dates as UTC midnight.

### Issue 4.2: `lotSizeArea` is 0 rejected by Zod, but DB allows it
- **Category:** Business Logic Gaps
- **Severity:** LOW
- **Reproduction:** The Zod schema requires `positive()`, but the DB `properties.lotSizeArea` is `real` with no constraint. A direct DB insert of `0` is possible.
- **Impact:** Inconsistent data quality. A land parcel with 0 sqft is nonsensical.
- **Fix:** Add a Drizzle check constraint or enforce validation at the DB layer.

### Issue 4.3: `bedroomsTotal` can be 0 for Residential properties
- **Category:** Business Logic Gaps
- **Severity:** MEDIUM
- **Reproduction:** Send `propertyType: "Residential"` with `bedroomsTotal: 0`.
- **Impact:** Zod's `.refine()` only checks that `bedroomsTotal !== undefined`, not that it's > 0. A 0-bedroom "residential" property passes validation.
- **Fix:** Change the refine to `data.bedroomsTotal > 0` for Residential.

### Issue 4.4: `listPrice` exactly $50,000,000 is allowed
- **Category:** Business Logic Gaps
- **Severity:** LOW
- **Reproduction:** Send `listPrice: 5000000000` (cents).
- **Impact:** The business rule validator checks `> 50_000_000_00`, so exactly $50M is permitted. This is technically by design but may be an off-by-one policy gap.
- **Fix:** Change to `>=` if the intent is to cap at $50M.

### Issue 4.5: `yearBuilt` boundary uses module-load time
- **Category:** Business Logic Gaps
- **Severity:** LOW
- **Reproduction:** `z.number().max(new Date().getFullYear())` evaluates `2026` when the module loads. If the worker runs until 2027 without restart, 2027 becomes invalid.
- **Impact:** Very edge-case in serverless, but possible in long-lived DOs.
- **Fix:** Use a custom refinement that evaluates `new Date().getFullYear()` at validation time, not module load time.

---

## 5. Operational Gaps

### Issue 5.1: No D1 fallback — total outage if DB is down
- **Category:** Operational Gaps
- **Severity:** HIGH
- **Reproduction:** D1 returns `SqliteError` or connection timeout.
- **Impact:** `/admin/intakes` and `/admin/intakes/:id/export/reso` throw unhandled 500s with no graceful degradation.
- **Fix:** Wrap DB calls in `try/catch`; return `503 Service Unavailable` with a retry-after header.

### Issue 5.2: No DO storage failure handling
- **Category:** Operational Gaps
- **Severity:** HIGH
- **Reproduction:** `this.ctx.storage.get()` throws (e.g., transient DO storage partition error).
- **Impact:** DO crashes, request fails with opaque 500.
- **Fix:** Catch storage errors in `load()` and return a `503` or replay from D1 event log.

### Issue 5.3: MLS push has no timeout or retry
- **Category:** Operational Gaps
- **Severity:** HIGH
- **Reproduction:** MLS endpoint hangs for > 100 seconds.
- **Impact:** Worker request times out, wasting compute. No retry means a transient MLS blip results in a failed listing push.
- **Fix:** Add `AbortSignal` with a 10-second timeout and implement exponential backoff retries via a Queue or alarm.

### Issue 5.4: No idempotency keys on `createIntake` or `mls/push`
- **Category:** Operational Gaps
- **Severity:** HIGH
- **Reproduction:** Client retries due to network blip. `createIntake` creates a duplicate. `mls/push` pushes a duplicate listing.
- **Impact:** Duplicate intakes and duplicate MLS listings.
- **Fix:** Accept `Idempotency-Key` header. Store keys in KV or D1 for 24h and deduplicate.

### Issue 5.5: `/health` does not check dependencies
- **Category:** Operational Gaps
- **Severity:** MEDIUM
- **Reproduction:** `/health` returns `{ status: "ok" }` even when D1 is down, DO namespace is broken, and R2 is unreachable.
- **Impact:** Load balancers and monitoring think the service is healthy when it is degraded.
- **Fix:** Implement deep health checks: lightweight D1 `SELECT 1`, DO stub ping, and R2 head-object check.

### Issue 5.6: `/admin/intakes` is capped at 100 with no pagination
- **Category:** Operational Gaps
- **Severity:** MEDIUM
- **Reproduction:** Create 101 intakes. The 101st is invisible in the admin dashboard.
- **Impact:** Ops teams cannot see or manage older intakes.
- **Fix:** Add `cursor` / `offset` pagination to the query.

---

## 6. RESO / MLS Gaps (Deep Audit)

### Issue 6.1: Media export excludes non-photo/floorplan documents
- **Category:** RESO/MLS Gaps
- **Severity:** HIGH
- **Reproduction:** Upload a `survey`, `disclosure`, or virtual tour document. Call `/admin/intakes/:id/export/reso`.
- **Impact:** `buildRESOPropertyPayload` filters to only `photo` and `floorplan`. Deeds, disclosures, and virtual tours are dropped from the RESO payload, violating RCF completeness.
- **Fix:** Remove the filter and map all document types to appropriate `MediaCategory` values (e.g., `Document`, `Branded Virtual Tour`).

### Issue 6.2: `PropertyType` PascalCase mapping is broken for several types
- **Category:** RESO/MLS Gaps
- **Severity:** HIGH
- **Reproduction:** Store `propertyType: "commercial"` in DB. Export shows `PropertyType: "Commercial"` instead of RESO-required `"Commercial Sale"`.
- **Impact:** MLS ingestion fails because `"Commercial"` is not a valid RESO Data Dictionary 2.0 lookup.
- **Fix:** Build an explicit lookup map from internal enum → RESO lookup values instead of using `toTitleCase()`.

### Issue 6.3: `ListPrice` sent as dollars without MLS negotiation
- **Category:** RESO/MLS Gaps
- **Severity:** MEDIUM
- **Reproduction:** `listPrice` stored as `50000000` cents → exported as `500000.0` dollars.
- **Impact:** Some MLSs expect cents. The code assumes dollars but does not negotiate or document this per-MLS.
- **Fix:** Make price unit configurable per MLS connector and document the contract.

### Issue 6.4: No handling of `409 Conflict` or `412 Precondition Failed`
- **Category:** RESO/MLS Gaps
- **Severity:** MEDIUM
- **Reproduction:** MLS returns `409` (duplicate key) or `412` (stale ETag).
- **Impact:** `RESOWebAPIAdapter.createListing` treats these as generic failures. No retry, no merge strategy, no user-friendly error mapping.
- **Fix:** Add explicit branches for 409 (fetch existing and PATCH) and 412 (refetch and retry with current ETag).

### Issue 6.5: No retry/backoff mechanism for MLS pushes
- **Category:** RESO/MLS Gaps
- **Severity:** HIGH
- **Reproduction:** MLS returns `503` or `429`.
- **Impact:** The adapter returns `success: false` immediately. No queueing, no retries.
- **Fix:** Integrate with `INTAKE_QUEUE` to defer retries with exponential backoff.

### Issue 6.6: Webhook `/webhooks/document-extracted` has no signature verification
- **Category:** RESO/MLS Gaps
- **Severity:** CRITICAL
- **Reproduction:** `curl -X POST /webhooks/document-extracted -d '{"fake": true}'` is accepted.
- **Impact:** Attackers can inject fake document extraction events, corrupting intake data.
- **Fix:** Verify HMAC-SHA256 signature (or mTLS / API key) before accepting the payload.

### Issue 6.7: Missing `SourceSystemName` / `SourceSystemKey`
- **Category:** RESO/MLS Gaps
- **Severity:** LOW
- **Reproduction:** Export RESO payload. Only `OriginatingSystemName` / `Key` are present.
- **Impact:** Some MLSs require `SourceSystemName` for data provenance tracking.
- **Fix:** Add `SourceSystemName` and `SourceSystemKey` to the export mapper.

### Issue 6.8: `DaysOnMarket` and `CumulativeDaysOnMarket` are not computed
- **Category:** RESO/MLS Gaps
- **Severity:** MEDIUM
- **Reproduction:** Export any intake. These fields are absent.
- **Impact:** MLSs often require DOM/CDOM for compliance. The portal has `listingContractDate` and `approvedAt` but never computes days on market.
- **Fix:** Compute `DaysOnMarket` from `listingContractDate` → `ModificationTimestamp` (or now) and include in export.

---

## Top 5 Worst Gaps (Ranked by Blast Radius)

### 1. Approval & Blocking Are Completely Broken (Issues 1.1, 1.2)
**Severity: CRITICAL**
The `_meta` object sent from API routes to the DO omits the `role` field. `canTransitionStatus` checks `reviewerRoles.has(context.role)`, which is always `false` when `role` is `undefined`. **No intake can ever be approved or blocked.** This is a total feature outage for the core workflow.

### 2. Intakes Get Stuck in `submitted` Forever (Issue 1.3)
**Severity: CRITICAL**
After a seller submits, there is no API route to transition the intake to `under_review`. Since `approved` and `blocked` can only be reached from `under_review`, the intake enters a **permanent deadlock**. Even if Issue #1 were fixed, the workflow would still be broken.

### 3. No Authentication / Authorization on Admin Routes (Issue 3.6)
**Severity: CRITICAL**
Any unauthenticated HTTP client can call `/admin/intakes/:id/approve`, `/block`, `/assign`, and `/mls/push`. The API hardcodes `actorType: "coordinator"` without verifying identity. This is a **complete authorization bypass**.

### 4. Webhook Signature Verification Missing (Issue 6.6)
**Severity: CRITICAL**
`/webhooks/document-extracted` accepts any POST body from any source. An attacker can inject fraudulent document-extraction events, leading to **data corruption and potential supply-chain attacks** on downstream MLS data.

### 5. Empty Checklist Auto-Approves (Issue 1.4)
**Severity: HIGH**
`areRequiredTasksComplete()` returns `true` when the checklist Map is empty. Combined with a `readinessScore >= 60`, an intake with **zero tasks** can be approved. This undermines the operational quality gate that tasks are meant to enforce.

---

## Recommended Immediate Action Plan

| Priority | Action | Files to Change |
|----------|--------|-----------------|
| P0 | Add `role` to all command `_meta` payloads in API routes | `src/api/index.ts` |
| P0 | Add `POST /admin/intakes/:id/start-review` route | `src/api/index.ts`, `src/domains/commands.ts`, `src/durable-objects/listing-intake-do.ts` |
| P0 | Implement auth middleware | `src/api/index.ts` |
| P0 | Verify webhook signatures | `src/api/index.ts` |
| P1 | Make DO `persist()` / `load()` atomic | `src/durable-objects/listing-intake-do.ts` |
| P1 | Add idempotency keys | `src/api/index.ts`, `src/durable-objects/listing-intake-do.ts` |
| P1 | Fix RESO `PropertyType` mapping | `src/export/reso.ts` |
| P1 | Include all document types in RESO Media export | `src/export/reso.ts` |
| P2 | Add request size limits and DO input validation | `src/api/index.ts`, `src/durable-objects/listing-intake-do.ts` |
| P2 | Add MLS push timeout, retry, and Queue integration | `src/connectors/mls.ts`, `wrangler.jsonc` |

---

*End of audit report.*
