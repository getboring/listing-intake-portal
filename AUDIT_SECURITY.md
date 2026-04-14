# Security & Best Practices Audit Report
**Project:** `listing-intake-portal`  
**Date:** 2026-04-13  
**Scope:** `src/` and `app/` directories, `wrangler.jsonc`, `tsconfig.json`

---

## Executive Summary
The application has **zero authentication/authorization enforcement** across all API routes. Combined with missing input validation on several endpoints, broken RBAC propagation to the Durable Object state machine, and sensitive MLS credentials being accepted via request bodies, the system is currently unsuitable for production use without significant hardening.

**Overall Risk Rating: HIGH**

---

## 1. Authentication / Authorization

### Issue 1.1 — No Authentication on Any Route
- **Severity:** Critical
- **File:** `src/api/index.ts` (entire file, e.g. lines 44, 63, 68, 89, 109, 120, 134, 150, 169, 188, 207, 216, 238)
- **Problem:** Every route—seller-facing, admin-facing, and webhook—is completely open. There are no session checks, JWT validation, API keys, or middleware gating access.
- **Impact:** Any unauthenticated actor with an intake ID can read, modify, submit, approve, block, or push MLS data for any intake.
- **Fix:** Implement Hono middleware that validates a session token (e.g., Cloudflare Access JWT, custom auth cookie, or API key) and attaches the authenticated user to the context.

```ts
// Example: src/api/middleware/auth.ts
export const requireAuth = async (c: Context, next: Next) => {
  const token = c.req.header("Authorization")?.replace("Bearer ", "");
  if (!token) return c.json({ error: "Unauthorized" }, 401);
  const user = await verifyToken(c.env, token);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  c.set("user", user);
  await next();
};
```

### Issue 1.2 — Seller Access Not Scoped to Own Intake
- **Severity:** Critical
- **File:** `src/api/index.ts` lines 63–117
- **Problem:** Routes like `GET /intakes/:id`, `PATCH /intakes/:id/sections/:sectionKey`, and `POST /intakes/:id/submit` accept any `:id` parameter with no verification that the caller is the invited seller or an assigned agent.
- **Impact:** An attacker can enumerate intake IDs and modify arbitrary seller data.
- **Fix:** After authentication, query the database to confirm the caller’s `userId` matches `listingIntakes.clientId`, `assignedAgentId`, or `assignedCoordinatorId` before forwarding to the DO.

### Issue 1.3 — Admin Routes Unprotected
- **Severity:** Critical
- **File:** `src/api/index.ts` lines 120–277
- **Problem:** All `/admin/*` routes are accessible without any role check.
- **Impact:** Anyone can list all intakes, approve/block submissions, and trigger MLS pushes.
- **Fix:** Enforce `role === "admin" || role === "coordinator"` (or your desired RBAC) in middleware before the admin route handlers.

### Issue 1.4 — RBAC Enforcement Broken in API Layer
- **Severity:** High
- **File:** `src/api/index.ts` lines 56, 82, 102, 113, 162, 181, 200
- **Problem:** The API constructs `_meta: { actorType: "seller" | "agent" | ... }` but **never includes `role` or `timestamp`**, even though `CommandContext` requires them.
- **Impact:** The Durable Object state machine (`canTransitionStatus`) receives `role: undefined`. `reviewerRoles.has(undefined)` is always `false`, so approve/block transitions fail for legitimate users, yet because there is no route-level auth, malicious users can still hit the endpoints directly.
- **Fix:** Include the validated user role and current timestamp in every `_meta` payload:

```ts
_meta: {
  actorType: "seller",
  role: "seller",        // <-- missing
  timestamp: new Date().toISOString(), // <-- missing
  actorUserId: user.id,  // <-- missing
}
```

---

## 2. Input Validation

### Issue 2.1 — Six of Eight Section Payloads Are Unvalidated
- **Severity:** High
- **File:** `src/api/index.ts` lines 15–24; `src/schemas/index.ts`
- **Problem:** `zUpdateSectionPayload` uses `z.record(z.unknown())` for `contact_info`, `ownership_disclosures`, `media_condition`, `pricing_goals`, `review_submit`, and `complete`. This allows arbitrary JSON injection.
- **Impact:** Attackers can store unexpected shapes, oversized objects, or malicious strings that downstream consumers may mishandle.
- **Fix:** Define and enforce strict Zod schemas for every section key.

### Issue 2.2 — `as` Casts on Untrusted Request Data
- **Severity:** High
- **File:** `src/durable-objects/listing-intake-do.ts` lines 378, 392, 401, 414, 417, 420, 429, 443, 452
- **Problem:** The DO `fetch()` handler casts the raw JSON body with `as Record<string, unknown>` and then `as unknown as <CommandType>`. This bypasses both runtime and compile-time safety.
- **Impact:** Malformed commands can reach business logic; required fields like `role` and `timestamp` are silently `undefined`.
- **Fix:** Validate the full command shape with Zod before processing. Replace all `as` casts with proper parsing.

```ts
const zCommand = z.discriminatedUnion("type", [
  z.object({ type: z.literal("CreateIntake"), orgId: z.string(), propertyId: z.string(), clientId: z.string(), _meta: zCommandContext }),
  // ... etc
]);
```

### Issue 2.3 — File Upload Metadata Lacks Content & Origin Verification
- **Severity:** Medium
- **File:** `src/api/index.ts` lines 26–32
- **Problem:** `zUploadDocumentPayload` validates `fileSizeBytes` as a non-negative integer with no upper bound, and does not verify that `storageKey` actually exists in `DOCUMENTS_BUCKET`. There is no MIME-type whitelist or malware scanning hook.
- **Impact:** Attackers can claim a 10TB file, reference arbitrary R2 keys, or upload malicious content.
- **Fix:**
  - Add a `max(100_000_000)` (or your limit) to `fileSizeBytes`.
  - Verify the object exists in `DOCUMENTS_BUCKET` before recording it.
  - Validate MIME type against an allowlist (`image/jpeg`, `application/pdf`, etc.).

---

## 3. SQL Injection / ORM Safety

- **Status:** Safe
- **Observation:** All database interactions use Drizzle’s query builder or `eq()` with parameterized values. No raw SQL strings are constructed from user input.

---

## 4. Secrets & Config

### Issue 4.1 — MLS Credentials Passed in Request Body
- **Severity:** Critical
- **File:** `src/api/index.ts` lines 238–253; `src/connectors/mls.ts`
- **Problem:** The `/admin/intakes/:id/mls/push` endpoint accepts `clientId` and `clientSecret` directly from the JSON body. These are sensitive secrets that should never transit through application API requests.
- **Impact:** Credentials can be logged by reverse proxies, exposed in browser dev tools, or leaked in error messages.
- **Fix:** Store MLS credentials in **Cloudflare Secrets Store** or as encrypted environment variables, reference them by an `orgId` or `connectionId`, and never accept them in request bodies.

### Issue 4.2 — `wrangler.jsonc` Missing Sensitive Binding Warnings
- **Severity:** Low
- **File:** `wrangler.jsonc`
- **Problem:** While no secrets are hardcoded, the config does not document that `clientSecret`-style values must be injected via `wrangler secret put` rather than committed.
- **Fix:** Add a comment block in `wrangler.jsonc`:

```jsonc
// NOTE: Never commit secrets here. Use:
//   npx wrangler secret put <NAME>
```

---

## 5. Durable Object Safety

### Issue 5.1 — No `blockConcurrencyWhile` During State Initialization
- **Severity:** Medium
- **File:** `src/durable-objects/listing-intake-do.ts` lines 52–86
- **Problem:** `createIntake` sets initial state but does not wrap it in `this.ctx.blockConcurrencyWhile()`.
- **Impact:** While DOs are single-threaded, failing to block concurrency during initial creation can lead to inconsistent state if the DO is accessed before the first `persist()` completes (e.g., during migrations or restores).
- **Fix:** Wrap initial state writes:

```ts
async createIntake(cmd: CreateIntakeCommand) {
  return this.ctx.blockConcurrencyWhile(async () => {
    this.intakeId = crypto.randomUUID();
    // ...
    await this.persist();
    // ...
  });
}
```

### Issue 5.2 — `load()` / `persist()` Pattern
- **Status:** Mostly Safe
- **Observation:** Every command handler calls `await this.load()` at the start and `await this.persist()` after mutations. Because DOs process requests sequentially, race conditions are not currently possible *within* a single DO instance.
- **Caveat:** `inviteSeller` (line 138) does not mutate DO fields and therefore skips `persist()`. If future maintainers add state mutations there, they must remember to call `persist()`.

---

## 6. Frontend Security

### Issue 6.1 — No XSS via `dangerouslySetInnerHTML`
- **Status:** Safe
- **Observation:** React JSX escaping is used consistently. No `dangerouslySetInnerHTML` was found.

### Issue 6.2 — Unescaped `window.prompt` Input Fed Directly to API
- **Severity:** Low
- **File:** `app/components/AdminDashboard.tsx` line 46
- **Problem:** The block reason from `window.prompt` is sent to the API without client-side trimming or length checks.
- **Impact:** Minimal due to React escaping and Zod validation on the backend, but a user could accidentally paste multi-kilobyte text.
- **Fix:** Trim and enforce a max length before sending.

---

## 7. RESO/MLS Connector Security

### Issue 7.1 — MLS Credentials Not Logged but Transmitted Insecurely
- **Severity:** Critical
- **File:** `src/api/index.ts` lines 243–248
- **Problem:** As noted in 4.1, secrets arrive via JSON body. They are not logged in source code, but they may be logged by infrastructure.
- **Fix:** Remove `auth` from the request schema; load it from secure storage.

### Issue 7.2 — OAuth Token Refresh Logic Is Correct
- **Status:** Safe
- **Observation:** `ensureAuth()` checks `Date.now() >= this.expiresAt - 60_000` and refreshes proactively.

### Issue 7.3 — TLS Not Enforced on MLS Endpoints
- **Severity:** Medium
- **File:** `src/connectors/mls.ts` lines 27, 36, 78, 102, 121
- **Problem:** `tokenEndpoint` and `baseUrl` are validated with `z.string().url()` but not restricted to `https://`.
- **Impact:** An attacker (or misconfiguration) could cause credentials and listing data to travel over plaintext HTTP.
- **Fix:** Add a Zod refinement:

```ts
z.string().url().refine((u) => u.startsWith("https://"), { message: "MLS endpoints must use HTTPS" })
```

### Issue 7.4 — Potential OData Injection in `mlsListingKey`
- **Severity:** Medium
- **File:** `src/connectors/mls.ts` lines 102, 121
- **Problem:** `mlsListingKey` is interpolated directly into an OData URL: `` `${baseUrl}/${resourceName}('${mlsListingKey}')` ``.
- **Impact:** A malicious `mlsListingKey` containing `'); DROP ...` or OData control characters could alter the request semantics.
- **Fix:** URL-encode `mlsListingKey` before interpolation, or validate it against a strict regex (e.g., `^[A-Za-z0-9\-]+$`).

---

## 8. API Design

### Issue 8.1 — Webhooks Accept Any Request Without Verification
- **Severity:** High
- **File:** `src/api/index.ts` lines 280–286
- **Problem:** `/webhooks/document-extracted` and `/webhooks/email-events` return `200 OK` for every request with no signature validation, source IP check, or payload schema enforcement.
- **Impact:** Attackers can flood the application with fake webhook events.
- **Fix:** Verify HMAC signatures or bearer tokens, validate the payload with Zod, and consider IP allowlisting for known providers.

### Issue 8.2 — Internal Errors Leaked to Client
- **Severity:** Medium
- **File:** `src/connectors/mls.ts` line 43; `src/api/index.ts` lines 274–276
- **Problem:** `authenticate()` throws `new Error(\`MLS auth failed: ${res.status} ${await res.text()}\`)`. The API route has no try/catch, so this becomes a `500` response with the raw MLS server error body.
- **Impact:** Internal MLS endpoint details and possibly secrets are exposed to the API caller.
- **Fix:** Catch MLS errors in the route and return a sanitized message:

```ts
try {
  const result = await connector.createListing(payload);
  return c.json(result);
} catch (err) {
  console.error("MLS push failed", err);
  return c.json({ error: "MLS push failed" }, 502);
}
```

### Issue 8.3 — No Rate Limiting
- **Severity:** High
- **File:** `src/api/index.ts` (all routes)
- **Problem:** No rate limits, Cloudflare Turnstile, or throttling logic exists.
- **Impact:** Brute-force of intake IDs, credential stuffing, and webhook spam are trivial.
- **Fix:** Add a Cloudflare rate-limiting rule or in-memory token-bucket middleware using the CF Connecting IP.

### Issue 8.4 — Placeholder Admin Endpoint Does Not Persist
- **Severity:** Low
- **File:** `src/api/index.ts` lines 207–213
- **Problem:** `POST /admin/intakes/:id/request-revision` validates the body and immediately returns `{ received: true }` without updating the DO or database.
- **Fix:** Either implement the revision workflow or remove the endpoint.

---

## 9. TypeScript Best Practices

### Issue 9.1 — Unused Imports
- **Severity:** Low
- **Files:**
  - `src/durable-objects/listing-intake-do.ts` line 23 — `import { z } from "zod";` (unused)
  - `src/domains/commands.ts` line 1 — `MessageChannel` (unused)
  - `src/events/types.ts` line 1 — `SectionKey` (unused)
- **Fix:** Remove unused imports to reduce bundle size and noise.

### Issue 9.2 — `any` Types
- **Status:** Clean
- **Observation:** No explicit `any` annotations were found. The codebase prefers `Record<string, unknown>`.

### Issue 9.3 — Strict Null Checks
- **Status:** Enabled
- **Observation:** `tsconfig.json` has `"strict": true`, so `strictNullChecks` is active.

---

## Top 5 Most Critical Issues

| Rank | Issue | Severity | Why It Matters |
|------|-------|----------|----------------|
| 1 | **Zero Authentication/Authorization** | Critical | Every route is world-readable and world-writable. An attacker can read any intake, approve/block submissions, and trigger MLS pushes. |
| 2 | **MLS Credentials in Request Body** | Critical | Sensitive `clientSecret` values are accepted via public API JSON, exposing them to logs, proxies, and browser dev tools. |
| 3 | **Unauthenticated Webhooks** | High | Anyone can POST fake events to `/webhooks/*` with no signature or token verification, enabling event injection. |
| 4 | **Unvalidated Section Payloads (6 of 8)** | High | `z.record(z.unknown())` allows arbitrary data injection into intake sections, breaking downstream consumers and enabling DoS via oversized objects. |
| 5 | **Broken RBAC Propagation to DO** | High | The API never passes `role` in command `_meta`, causing the state machine’s `canTransitionStatus` to receive `undefined`. This neuters the intended access controls and can break legitimate workflows. |

---

## Recommended Immediate Actions
1. **Add authentication middleware** to *all* routes before any other work.
2. **Move MLS credentials** out of request bodies and into Cloudflare Secrets Store.
3. **Validate every command** entering the Durable Object with Zod (remove all `as` casts).
4. **Lock down webhooks** with HMAC signature verification and Zod payload validation.
5. **Enforce HTTPS** on all MLS endpoint URLs and sanitize `mlsListingKey` before URL interpolation.
