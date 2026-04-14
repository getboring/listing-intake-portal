import { Hono } from "hono";
import { z } from "zod";
import { eq, desc } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "~/db/schema.js";
import {
  zPropertyDetailsSection,
  zAccessShowingsSection,
  zContactInfoSection,
  zOwnershipDisclosuresSection,
  zMediaConditionSection,
  zPricingGoalsSection,
  zReviewSubmitSection,
  zCompleteSection,
  zDocumentType,
} from "~/schemas/index.js";
import type { Env } from "~/lib/env.js";
import { buildRESOPropertyPayload } from "~/export/reso.js";
import { createMLSConnector } from "~/connectors/mls.js";
import type { UserRole } from "~/domains/types.js";

const MAX_BODY_SIZE = 1024 * 1024; // 1 MB
const MAX_FILE_SIZE = 100_000_000; // 100 MB
const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "application/pdf",
  "text/plain",
  "application/json",
]);

// Rate limiting: simple in-memory token bucket per IP
const rateLimitBuckets = new Map<string, { tokens: number; last: number }>();
const RATE_LIMIT_RPS = 10;
const RATE_LIMIT_BURST = 20;

function getBucketKey(c: { req: { header: (name: string) => string | undefined } }): string {
  return c.req.header("cf-connecting-ip") || c.req.header("x-forwarded-for") || "unknown";
}

function consumeToken(key: string): boolean {
  const now = Date.now();
  const bucket = rateLimitBuckets.get(key);
  if (!bucket) {
    rateLimitBuckets.set(key, { tokens: RATE_LIMIT_BURST - 1, last: now });
    return true;
  }
  const elapsed = (now - bucket.last) / 1000;
  bucket.tokens = Math.min(RATE_LIMIT_BURST, bucket.tokens + elapsed * RATE_LIMIT_RPS);
  bucket.last = now;
  if (bucket.tokens >= 1) {
    bucket.tokens -= 1;
    return true;
  }
  return false;
}

async function verifyWebhookSignature(payload: string, signature: string, secret: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  const expected = btoa(String.fromCharCode(...new Uint8Array(sig)));
  // Constant-time compare
  if (signature.length !== expected.length) return false;
  let result = 0;
  for (let i = 0; i < signature.length; i++) {
    result |= signature.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return result === 0;
}

function actorTypeToRole(actorType: string): UserRole {
  switch (actorType) {
    case "seller":
      return "seller";
    case "agent":
      return "agent";
    case "coordinator":
      return "coordinator";
    case "system":
    default:
      return "admin";
  }
}

function buildMeta(actorType: string, actorUserId?: string) {
  return {
    actorType: actorType as "seller" | "agent" | "coordinator" | "system",
    actorUserId,
    role: actorTypeToRole(actorType),
    timestamp: new Date().toISOString(),
  };
}

const zUpdateSectionPayload = z.discriminatedUnion("sectionKey", [
  z.object({ sectionKey: z.literal("property_details"), payload: zPropertyDetailsSection }),
  z.object({ sectionKey: z.literal("access_showings"), payload: zAccessShowingsSection }),
  z.object({ sectionKey: z.literal("contact_info"), payload: zContactInfoSection }),
  z.object({ sectionKey: z.literal("ownership_disclosures"), payload: zOwnershipDisclosuresSection }),
  z.object({ sectionKey: z.literal("media_condition"), payload: zMediaConditionSection }),
  z.object({ sectionKey: z.literal("pricing_goals"), payload: zPricingGoalsSection }),
  z.object({ sectionKey: z.literal("review_submit"), payload: zReviewSubmitSection }),
  z.object({ sectionKey: z.literal("complete"), payload: zCompleteSection }),
]);

const zUploadDocumentPayload = z.object({
  documentType: zDocumentType,
  fileName: z.string().min(1),
  storageKey: z.string().min(1),
  fileSizeBytes: z.number().int().nonnegative().max(MAX_FILE_SIZE),
  checksumSha256: z.string().optional(),
  mimeType: z.string().min(1).optional(),
});

export function getDOStub(env: Env, id: string) {
  const doId = env.LISTING_INTAKE_DO.idFromName(id);
  return env.LISTING_INTAKE_DO.get(doId);
}

// Simple API-token auth (fallback to no-auth if API_TOKEN is not configured for easy dev)
async function requireAuth(c: { env: Env; req: { header: (name: string) => string | undefined } }, next: () => Promise<void>): Promise<Response | void> {
  if (!c.env.API_TOKEN) {
    // In dev mode without API_TOKEN, allow through with a synthetic admin user
    (c as unknown as Record<string, unknown>).setUser = { id: "dev-user", role: "admin" };
    await next();
    return;
  }
  const auth = c.req.header("Authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (!token) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { "Content-Type": "application/json" } });
  }
  // In a real app, this would verify a JWT. For this project, we support a simple API_TOKEN.
  if (token !== c.env.API_TOKEN) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { "Content-Type": "application/json" } });
  }
  (c as unknown as Record<string, unknown>).setUser = { id: "token-user", role: "admin" };
  await next();
}

function getUser(c: { env: Env }): { id: string; role: UserRole } {
  return ((c as unknown as Record<string, unknown>).setUser as { id: string; role: UserRole }) || { id: "anonymous", role: "admin" };
}

async function requireRole(allowed: UserRole[], c: { env: Env }, next: () => Promise<void>): Promise<Response | void> {
  const user = getUser(c);
  if (!allowed.includes(user.role)) {
    return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { "Content-Type": "application/json" } });
  }
  await next();
}

const app = new Hono<{ Bindings: Env }>();

// CORS
app.use(async (c, next) => {
  c.res.headers.set("Access-Control-Allow-Origin", "*");
  c.res.headers.set("Access-Control-Allow-Methods", "GET, POST, PATCH, PUT, DELETE, OPTIONS");
  c.res.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Idempotency-Key");
  if (c.req.method === "OPTIONS") {
    return c.body(null, 204);
  }
  await next();
});

// Request size guard middleware
app.use(async (c, next) => {
  if (c.req.method === "POST" || c.req.method === "PATCH" || c.req.method === "PUT") {
    const contentLength = c.req.raw.headers.get("content-length");
    if (contentLength && parseInt(contentLength, 10) > MAX_BODY_SIZE) {
      return c.json({ success: false, errors: ["Request body too large"] }, 413);
    }
  }
  await next();
});

// Rate limit middleware (skip when IP is unknown to avoid breaking local tests)
app.use(async (c, next) => {
  const key = getBucketKey(c);
  if (key !== "unknown" && !consumeToken(key)) {
    return c.json({ success: false, errors: ["Rate limit exceeded"] }, 429);
  }
  await next();
});

// Auth middleware
app.use(async (c, next) => {
  const res = await requireAuth(c, next);
  if (res) return res;
});

app.get("/health", async (c) => {
  let dbOk = false;
  let doOk = false;
  let r2Ok = false;
  try {
    const db = drizzle(c.env.DB, { schema });
    await db.query.listingIntakes.findFirst({ columns: { id: true } });
    dbOk = true;
  } catch {
    dbOk = false;
  }
  try {
    const stub = getDOStub(c.env, "health-check");
    const res = await stub.fetch("http://do/", { method: "GET" });
    doOk = res.status === 200;
  } catch {
    doOk = false;
  }
  try {
    // lightweight R2 list check (bucket must exist)
    await c.env.DOCUMENTS_BUCKET.list({ limit: 1 });
    r2Ok = true;
  } catch {
    r2Ok = false;
  }
  const status = dbOk && doOk && r2Ok ? 200 : 503;
  return c.json({ status: dbOk && doOk && r2Ok ? "ok" : "degraded", db: dbOk, do: doOk, r2: r2Ok }, status);
});

async function verifySellerAccess(
  env: Env,
  intakeId: string,
  user: { id: string; role: UserRole }
): Promise<boolean> {
  if (user.role === "admin" || user.role === "agent" || user.role === "coordinator") return true;
  try {
    const db = drizzle(env.DB, { schema });
    const intake = await db.query.listingIntakes.findFirst({
      where: eq(schema.listingIntakes.id, intakeId),
      columns: { clientId: true, assignedAgentId: true, assignedCoordinatorId: true },
    });
    if (!intake) return false;
    return (
      intake.clientId === user.id ||
      intake.assignedAgentId === user.id ||
      intake.assignedCoordinatorId === user.id
    );
  } catch {
    return false;
  }
}

function parseIdempotencyKey(c: { req: { header: (name: string) => string | undefined } }): string | undefined {
  return c.req.header("X-Idempotency-Key")?.trim();
}

// Seller-facing
app.post("/intakes/:id/accept-invite", async (c) => {
  const parsed = z.object({ sellerEmail: z.string().email() }).safeParse(await c.req.json());
  if (!parsed.success) {
    return c.json({ success: false, errors: parsed.error.issues.map((i) => i.message) }, 400);
  }
  const user = getUser(c);
  const intakeId = c.req.param("id");
  const hasAccess = await verifySellerAccess(c.env, intakeId, user);
  if (!hasAccess) return c.json({ error: "Forbidden" }, 403);
  try {
    const stub = getDOStub(c.env, intakeId);
    const result = await stub.fetch("http://do/command", {
      method: "POST",
      body: JSON.stringify({
        type: "InviteSeller",
        intakeId,
        sellerEmail: parsed.data.sellerEmail,
        _meta: buildMeta("system", user.id),
      }),
      headers: { "Content-Type": "application/json" },
    });
    return result;
  } catch (err) {
    console.error("DO error", err);
    return c.json({ success: false, errors: ["Internal error"] }, 502);
  }
});

app.get("/intakes/:id", async (c) => {
  const user = getUser(c);
  const intakeId = c.req.param("id");
  const hasAccess = await verifySellerAccess(c.env, intakeId, user);
  if (!hasAccess) return c.json({ error: "Forbidden" }, 403);
  try {
    const stub = getDOStub(c.env, intakeId);
    return await stub.fetch("http://do/");
  } catch (err) {
    console.error("DO error", err);
    return c.json({ success: false, errors: ["Internal error"] }, 502);
  }
});

app.patch("/intakes/:id/sections/:sectionKey", async (c) => {
  const body = await c.req.json();
  const parsed = zUpdateSectionPayload.safeParse({ sectionKey: c.req.param("sectionKey"), payload: body });
  if (!parsed.success) {
    return c.json({ success: false, errors: parsed.error.issues.map((i) => i.message) }, 400);
  }
  const user = getUser(c);
  const intakeId = c.req.param("id");
  const hasAccess = await verifySellerAccess(c.env, intakeId, user);
  if (!hasAccess) return c.json({ error: "Forbidden" }, 403);
  try {
    const stub = getDOStub(c.env, intakeId);
    const result = await stub.fetch("http://do/command", {
      method: "POST",
      body: JSON.stringify({
        type: "UpdateSection",
        intakeId,
        sectionKey: parsed.data.sectionKey,
        payload: parsed.data.payload,
        _meta: buildMeta("seller", user.id),
      }),
      headers: { "Content-Type": "application/json" },
    });
    return result;
  } catch (err) {
    console.error("DO error", err);
    return c.json({ success: false, errors: ["Internal error"] }, 502);
  }
});

app.post("/intakes/:id/documents", async (c) => {
  const body = await c.req.json();
  const parsed = zUploadDocumentPayload.safeParse(body);
  if (!parsed.success) {
    return c.json({ success: false, errors: parsed.error.issues.map((i) => i.message) }, 400);
  }
  const user = getUser(c);
  const intakeId = c.req.param("id");
  const hasAccess = await verifySellerAccess(c.env, intakeId, user);
  if (!hasAccess) return c.json({ error: "Forbidden" }, 403);

  // Verify R2 object exists
  try {
    const head = await c.env.DOCUMENTS_BUCKET.head(parsed.data.storageKey);
    if (!head) {
      return c.json({ success: false, errors: ["Upload not found. Please upload the file first."] }, 400);
    }
  } catch {
    return c.json({ success: false, errors: ["Unable to verify upload"] }, 502);
  }

  // MIME whitelist check
  const mimeType = body.mimeType || "application/octet-stream";
  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    return c.json({ success: false, errors: ["Unsupported file type"] }, 400);
  }

  try {
    const stub = getDOStub(c.env, intakeId);
    const result = await stub.fetch("http://do/command", {
      method: "POST",
      body: JSON.stringify({
        type: "UploadDocument",
        intakeId,
        ...parsed.data,
        _meta: buildMeta("seller", user.id),
      }),
      headers: { "Content-Type": "application/json" },
    });
    return result;
  } catch (err) {
    console.error("DO error", err);
    return c.json({ success: false, errors: ["Internal error"] }, 502);
  }
});

app.post("/intakes/:id/submit", async (c) => {
  const user = getUser(c);
  const intakeId = c.req.param("id");
  const hasAccess = await verifySellerAccess(c.env, intakeId, user);
  if (!hasAccess) return c.json({ error: "Forbidden" }, 403);
  try {
    const stub = getDOStub(c.env, intakeId);
    const result = await stub.fetch("http://do/command", {
      method: "POST",
      body: JSON.stringify({ type: "SubmitIntake", intakeId, _meta: buildMeta("seller", user.id) }),
      headers: { "Content-Type": "application/json" },
    });
    return result;
  } catch (err) {
    console.error("DO error", err);
    return c.json({ success: false, errors: ["Internal error"] }, 502);
  }
});

// Admin routes
app.use("/admin/*", async (c, next) => {
  const user = getUser(c);
  const res = await requireRole(["admin", "coordinator", "agent"], c, next);
  if (res) return res;
});

app.get("/admin/intakes", async (c) => {
  const cursor = c.req.query("cursor");
  const limit = Math.min(parseInt(c.req.query("limit") || "50", 10), 100);
  try {
    const db = drizzle(c.env.DB, { schema });
    const rows = await db.query.listingIntakes.findMany({
      with: {
        property: true,
        client: true,
        assignedAgent: true,
      },
      orderBy: desc(schema.listingIntakes.createdAt),
      limit: limit + 1,
      offset: cursor ? parseInt(cursor, 10) || 0 : 0,
    });
    const hasMore = rows.length > limit;
    const data = hasMore ? rows.slice(0, limit) : rows;
    const nextCursorOffset = cursor ? (parseInt(cursor, 10) || 0) + limit : limit;
    return c.json({
      data,
      nextCursor: hasMore ? String(nextCursorOffset) : undefined,
    });
  } catch (err) {
    console.error("DB error", err);
    return c.json({ success: false, errors: ["Database unavailable"] }, 503);
  }
});

app.get("/admin/intakes/:id", async (c) => {
  try {
    const db = drizzle(c.env.DB, { schema });
    const intake = await db.query.listingIntakes.findFirst({
      where: eq(schema.listingIntakes.id, c.req.param("id")),
      with: {
        property: true,
        client: true,
        sections: true,
        documents: true,
        tasks: true,
      },
    });
    if (!intake) return c.json({ error: "Not found" }, 404);
    return c.json(intake);
  } catch (err) {
    console.error("DB error", err);
    return c.json({ success: false, errors: ["Database unavailable"] }, 503);
  }
});

app.post("/admin/intakes/:id/assign", async (c) => {
  const parsed = z.object({ coordinatorId: z.string().min(1) }).safeParse(await c.req.json());
  if (!parsed.success) {
    return c.json({ success: false, errors: parsed.error.issues.map((i) => i.message) }, 400);
  }
  const user = getUser(c);
  try {
    const stub = getDOStub(c.env, c.req.param("id"));
    const result = await stub.fetch("http://do/command", {
      method: "POST",
      body: JSON.stringify({
        type: "AssignCoordinator",
        intakeId: c.req.param("id"),
        coordinatorId: parsed.data.coordinatorId,
        _meta: buildMeta("agent", user.id),
      }),
      headers: { "Content-Type": "application/json" },
    });
    return result;
  } catch (err) {
    console.error("DO error", err);
    return c.json({ success: false, errors: ["Internal error"] }, 502);
  }
});

app.post("/admin/intakes/:id/start-review", async (c) => {
  const user = getUser(c);
  try {
    const stub = getDOStub(c.env, c.req.param("id"));
    const result = await stub.fetch("http://do/command", {
      method: "POST",
      body: JSON.stringify({
        type: "StartReview",
        intakeId: c.req.param("id"),
        _meta: buildMeta("coordinator", user.id),
      }),
      headers: { "Content-Type": "application/json" },
    });
    return result;
  } catch (err) {
    console.error("DO error", err);
    return c.json({ success: false, errors: ["Internal error"] }, 502);
  }
});

app.post("/admin/intakes/:id/approve", async (c) => {
  const parsed = z.object({ notes: z.string().max(2000).optional() }).safeParse(await c.req.json());
  if (!parsed.success) {
    return c.json({ success: false, errors: parsed.error.issues.map((i) => i.message) }, 400);
  }
  const user = getUser(c);
  try {
    const stub = getDOStub(c.env, c.req.param("id"));
    const result = await stub.fetch("http://do/command", {
      method: "POST",
      body: JSON.stringify({
        type: "ApproveIntake",
        intakeId: c.req.param("id"),
        notes: parsed.data.notes,
        _meta: buildMeta("coordinator", user.id),
      }),
      headers: { "Content-Type": "application/json" },
    });
    return result;
  } catch (err) {
    console.error("DO error", err);
    return c.json({ success: false, errors: ["Internal error"] }, 502);
  }
});

app.post("/admin/intakes/:id/block", async (c) => {
  const parsed = z.object({ reason: z.string().min(1).max(2000) }).safeParse(await c.req.json());
  if (!parsed.success) {
    return c.json({ success: false, errors: parsed.error.issues.map((i) => i.message) }, 400);
  }
  const user = getUser(c);
  try {
    const stub = getDOStub(c.env, c.req.param("id"));
    const result = await stub.fetch("http://do/command", {
      method: "POST",
      body: JSON.stringify({
        type: "BlockIntake",
        intakeId: c.req.param("id"),
        reason: parsed.data.reason,
        _meta: buildMeta("coordinator", user.id),
      }),
      headers: { "Content-Type": "application/json" },
    });
    return result;
  } catch (err) {
    console.error("DO error", err);
    return c.json({ success: false, errors: ["Internal error"] }, 502);
  }
});

app.post("/admin/intakes/:id/request-revision", async (c) => {
  const parsed = z.object({ notes: z.string().min(1).max(2000) }).safeParse(await c.req.json());
  if (!parsed.success) {
    return c.json({ success: false, errors: parsed.error.issues.map((i) => i.message) }, 400);
  }
  const user = getUser(c);
  try {
    const stub = getDOStub(c.env, c.req.param("id"));
    const result = await stub.fetch("http://do/command", {
      method: "POST",
      body: JSON.stringify({
        type: "RequestRevision",
        intakeId: c.req.param("id"),
        notes: parsed.data.notes,
        _meta: buildMeta("coordinator", user.id),
      }),
      headers: { "Content-Type": "application/json" },
    });
    return result;
  } catch (err) {
    console.error("DO error", err);
    return c.json({ success: false, errors: ["Internal error"] }, 502);
  }
});

// RESO Export
app.get("/admin/intakes/:id/export/reso", async (c) => {
  try {
    const db = drizzle(c.env.DB, { schema });
    const intake = await db.query.listingIntakes.findFirst({
      where: eq(schema.listingIntakes.id, c.req.param("id")),
      with: {
        property: true,
        documents: true,
        assignedAgent: true,
      },
    });
    if (!intake) return c.json({ error: "Not found" }, 404);
    const payload = buildRESOPropertyPayload(
      intake.property,
      intake,
      intake.documents,
      intake.assignedAgent,
      { baseMediaUrl: "" }
    );
    return c.json(payload);
  } catch (err) {
    console.error("DB error", err);
    return c.json({ success: false, errors: ["Database unavailable"] }, 503);
  }
});

// MLS Push (RESO Web API Add/Edit)
function lookupMLSCredentials(env: Env, orgId: string): { baseUrl: string; resourceName: string; clientId: string; clientSecret: string; tokenEndpoint: string; scope?: string } | null {
  try {
    const map = JSON.parse(env.MLS_CONNECTIONS_JSON || "{}") as Record<string, unknown>;
    const conn = map[orgId] as { baseUrl?: string; resourceName?: string; clientId?: string; clientSecret?: string; tokenEndpoint?: string; scope?: string } | undefined;
    if (!conn?.baseUrl || !conn.clientId || !conn.clientSecret || !conn.tokenEndpoint) return null;
    return {
      baseUrl: conn.baseUrl,
      resourceName: conn.resourceName || "Property",
      clientId: conn.clientId,
      clientSecret: conn.clientSecret,
      tokenEndpoint: conn.tokenEndpoint,
      scope: conn.scope,
    };
  } catch {
    return null;
  }
}

app.post("/admin/intakes/:id/mls/push", async (c) => {
  const idempotencyKey = parseIdempotencyKey(c);
  try {
    const db = drizzle(c.env.DB, { schema });
    const intake = await db.query.listingIntakes.findFirst({
      where: eq(schema.listingIntakes.id, c.req.param("id")),
      with: {
        property: true,
        documents: true,
        assignedAgent: true,
      },
    });
    if (!intake) return c.json({ error: "Not found" }, 404);

    const creds = lookupMLSCredentials(c.env, intake.orgId);
    if (!creds) {
      return c.json({ success: false, errors: ["MLS credentials not configured for this organization"] }, 400);
    }

    const payload = buildRESOPropertyPayload(
      intake.property,
      intake,
      intake.documents,
      intake.assignedAgent,
      { baseMediaUrl: "" }
    );

    const connector = createMLSConnector({
      baseUrl: creds.baseUrl,
      resourceName: creds.resourceName,
      auth: {
        clientId: creds.clientId,
        clientSecret: creds.clientSecret,
        tokenEndpoint: creds.tokenEndpoint,
        scope: creds.scope,
      },
    });

    const result = await connector.createListing(payload);

    // If successful and idempotency key provided, we could store it in KV/D1.
    // For now, we just return the result.
    if (result.success && idempotencyKey) {
      // Best-effort: in a real system, persist the key + MLS key mapping
    }

    return c.json(result);
  } catch (err) {
    console.error("MLS push failed", err);
    return c.json({ success: false, errors: ["MLS push failed"] }, 502);
  }
});

// Document upload signed URL (R2)
app.get("/intakes/:id/documents/upload-url", async (c) => {
  const documentType = c.req.query("documentType");
  const fileName = c.req.query("fileName");
  if (!documentType || !fileName) {
    return c.json({ success: false, errors: ["Missing documentType or fileName"] }, 400);
  }
  const key = `intakes/${c.req.param("id")}/${crypto.randomUUID()}/${fileName}`;
  return c.json({ success: true, data: { storageKey: key, uploadUrl: `/intakes/${c.req.param("id")}/documents/direct-upload?key=${encodeURIComponent(key)}` } });
});

app.put("/intakes/:id/documents/direct-upload", async (c) => {
  const key = c.req.query("key");
  if (!key) return c.json({ success: false, errors: ["Missing key"] }, 400);
  const contentType = c.req.raw.headers.get("content-type") || "application/octet-stream";
  if (!ALLOWED_MIME_TYPES.has(contentType)) {
    return c.json({ success: false, errors: ["Unsupported file type"] }, 400);
  }
  await c.env.DOCUMENTS_BUCKET.put(key, c.req.raw.body, { httpMetadata: { contentType } });
  return c.json({ success: true, data: { storageKey: key } });
});

// Webhooks
app.post("/webhooks/document-extracted", async (c) => {
  const secret = c.env.WEBHOOK_SECRET;
  let payload: string;
  if (secret) {
    const signature = c.req.raw.headers.get("x-webhook-signature") || "";
    payload = await c.req.text();
    const valid = await verifyWebhookSignature(payload, signature, secret);
    if (!valid) {
      return c.json({ success: false, errors: ["Invalid signature"] }, 401);
    }
  } else {
    payload = await c.req.text();
  }
  try {
    const parsed = z.object({
      intakeId: z.string().min(1),
      documentId: z.string().min(1),
      extractedFields: z.record(z.unknown()),
      confidenceScore: z.number().min(0).max(1).optional(),
    }).safeParse(JSON.parse(payload));
    if (!parsed.success) {
      return c.json({ success: false, errors: parsed.error.issues.map((i) => i.message) }, 400);
    }
    // Process webhook here or enqueue
  } catch {
    return c.json({ success: false, errors: ["Invalid JSON"] }, 400);
  }
  return c.json({ received: true });
});

app.post("/webhooks/email-events", async (c) => {
  const secret = c.env.WEBHOOK_SECRET;
  let payload: string;
  if (secret) {
    const signature = c.req.raw.headers.get("x-webhook-signature") || "";
    payload = await c.req.text();
    const valid = await verifyWebhookSignature(payload, signature, secret);
    if (!valid) {
      return c.json({ success: false, errors: ["Invalid signature"] }, 401);
    }
  } else {
    payload = await c.req.text();
  }
  try {
    JSON.parse(payload);
  } catch {
    return c.json({ success: false, errors: ["Invalid JSON"] }, 400);
  }
  return c.json({ received: true });
});

export { app as apiRoutes };
