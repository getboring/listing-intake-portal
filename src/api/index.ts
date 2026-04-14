import { Hono } from "hono";
import { z } from "zod";
import { eq, desc } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "~/db/schema.js";
import {
  zPropertyDetailsSection,
  zAccessShowingsSection,
  zDocumentType,
} from "~/schemas/index.js";
import type { Env } from "~/lib/env.js";
import { buildRESOPropertyPayload } from "~/export/reso.js";
import { createMLSConnector } from "~/connectors/mls.js";
import type { UserRole } from "~/domains/types.js";

const MAX_BODY_SIZE = 1024 * 1024; // 1 MB

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
  z.object({ sectionKey: z.literal("contact_info"), payload: z.record(z.unknown()) }),
  z.object({ sectionKey: z.literal("ownership_disclosures"), payload: z.record(z.unknown()) }),
  z.object({ sectionKey: z.literal("media_condition"), payload: z.record(z.unknown()) }),
  z.object({ sectionKey: z.literal("pricing_goals"), payload: z.record(z.unknown()) }),
  z.object({ sectionKey: z.literal("review_submit"), payload: z.record(z.unknown()) }),
  z.object({ sectionKey: z.literal("complete"), payload: z.record(z.unknown()) }),
]);

const zUploadDocumentPayload = z.object({
  documentType: zDocumentType,
  fileName: z.string().min(1),
  storageKey: z.string().min(1),
  fileSizeBytes: z.number().int().nonnegative(),
  checksumSha256: z.string().optional(),
});

export function getDOStub(env: Env, id: string) {
  const doId = env.LISTING_INTAKE_DO.idFromName(id);
  return env.LISTING_INTAKE_DO.get(doId);
}

const app = new Hono<{ Bindings: Env }>();

// CORS
app.use(async (c, next) => {
  c.res.headers.set("Access-Control-Allow-Origin", "*");
  c.res.headers.set("Access-Control-Allow-Methods", "GET, POST, PATCH, PUT, DELETE, OPTIONS");
  c.res.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
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

app.get("/health", async (c) => {
  let dbOk = false;
  let doOk = false;
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
  const status = dbOk && doOk ? 200 : 503;
  return c.json({ status: dbOk && doOk ? "ok" : "degraded", db: dbOk, do: doOk }, status);
});

// Seller-facing
app.post("/intakes/:id/accept-invite", async (c) => {
  const parsed = z.object({ sellerEmail: z.string().email() }).safeParse(await c.req.json());
  if (!parsed.success) {
    return c.json({ success: false, errors: parsed.error.issues.map((i) => i.message) }, 400);
  }
  const stub = getDOStub(c.env, c.req.param("id"));
  const result = await stub.fetch("http://do/command", {
    method: "POST",
    body: JSON.stringify({
      type: "InviteSeller",
      intakeId: c.req.param("id"),
      sellerEmail: parsed.data.sellerEmail,
      _meta: buildMeta("system"),
    }),
    headers: { "Content-Type": "application/json" },
  });
  return result;
});

app.get("/intakes/:id", async (c) => {
  const stub = getDOStub(c.env, c.req.param("id"));
  return stub.fetch("http://do/");
});

app.patch("/intakes/:id/sections/:sectionKey", async (c) => {
  const body = await c.req.json();
  const parsed = zUpdateSectionPayload.safeParse({ sectionKey: c.req.param("sectionKey"), payload: body });
  if (!parsed.success) {
    return c.json({ success: false, errors: parsed.error.issues.map((i) => i.message) }, 400);
  }
  const stub = getDOStub(c.env, c.req.param("id"));
  const result = await stub.fetch("http://do/command", {
    method: "POST",
    body: JSON.stringify({
      type: "UpdateSection",
      intakeId: c.req.param("id"),
      sectionKey: parsed.data.sectionKey,
      payload: parsed.data.payload,
      _meta: buildMeta("seller"),
    }),
    headers: { "Content-Type": "application/json" },
  });
  return result;
});

app.post("/intakes/:id/documents", async (c) => {
  const body = await c.req.json();
  const parsed = zUploadDocumentPayload.safeParse(body);
  if (!parsed.success) {
    return c.json({ success: false, errors: parsed.error.issues.map((i) => i.message) }, 400);
  }
  const stub = getDOStub(c.env, c.req.param("id"));
  const result = await stub.fetch("http://do/command", {
    method: "POST",
    body: JSON.stringify({
      type: "UploadDocument",
      intakeId: c.req.param("id"),
      ...parsed.data,
      _meta: buildMeta("seller"),
    }),
    headers: { "Content-Type": "application/json" },
  });
  return result;
});

app.post("/intakes/:id/submit", async (c) => {
  const stub = getDOStub(c.env, c.req.param("id"));
  const result = await stub.fetch("http://do/command", {
    method: "POST",
    body: JSON.stringify({ type: "SubmitIntake", intakeId: c.req.param("id"), _meta: buildMeta("seller") }),
    headers: { "Content-Type": "application/json" },
  });
  return result;
});

// Internal admin
app.get("/admin/intakes", async (c) => {
  const db = drizzle(c.env.DB, { schema });
  const rows = await db.query.listingIntakes.findMany({
    with: {
      property: true,
      client: true,
      assignedAgent: true,
    },
    orderBy: desc(schema.listingIntakes.createdAt),
    limit: 100,
  });
  return c.json(rows);
});

app.get("/admin/intakes/:id", async (c) => {
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
});

app.post("/admin/intakes/:id/assign", async (c) => {
  const parsed = z.object({ coordinatorId: z.string().min(1) }).safeParse(await c.req.json());
  if (!parsed.success) {
    return c.json({ success: false, errors: parsed.error.issues.map((i) => i.message) }, 400);
  }
  const stub = getDOStub(c.env, c.req.param("id"));
  const result = await stub.fetch("http://do/command", {
    method: "POST",
    body: JSON.stringify({
      type: "AssignCoordinator",
      intakeId: c.req.param("id"),
      coordinatorId: parsed.data.coordinatorId,
      _meta: buildMeta("agent"),
    }),
    headers: { "Content-Type": "application/json" },
  });
  return result;
});

app.post("/admin/intakes/:id/start-review", async (c) => {
  const stub = getDOStub(c.env, c.req.param("id"));
  const result = await stub.fetch("http://do/command", {
    method: "POST",
    body: JSON.stringify({
      type: "StartReview",
      intakeId: c.req.param("id"),
      _meta: buildMeta("coordinator"),
    }),
    headers: { "Content-Type": "application/json" },
  });
  return result;
});

app.post("/admin/intakes/:id/approve", async (c) => {
  const parsed = z.object({ notes: z.string().optional() }).safeParse(await c.req.json());
  if (!parsed.success) {
    return c.json({ success: false, errors: parsed.error.issues.map((i) => i.message) }, 400);
  }
  const stub = getDOStub(c.env, c.req.param("id"));
  const result = await stub.fetch("http://do/command", {
    method: "POST",
    body: JSON.stringify({
      type: "ApproveIntake",
      intakeId: c.req.param("id"),
      notes: parsed.data.notes,
      _meta: buildMeta("coordinator"),
    }),
    headers: { "Content-Type": "application/json" },
  });
  return result;
});

app.post("/admin/intakes/:id/block", async (c) => {
  const parsed = z.object({ reason: z.string().min(1) }).safeParse(await c.req.json());
  if (!parsed.success) {
    return c.json({ success: false, errors: parsed.error.issues.map((i) => i.message) }, 400);
  }
  const stub = getDOStub(c.env, c.req.param("id"));
  const result = await stub.fetch("http://do/command", {
    method: "POST",
    body: JSON.stringify({
      type: "BlockIntake",
      intakeId: c.req.param("id"),
      reason: parsed.data.reason,
      _meta: buildMeta("coordinator"),
    }),
    headers: { "Content-Type": "application/json" },
  });
  return result;
});

app.post("/admin/intakes/:id/request-revision", async (c) => {
  const parsed = z.object({ notes: z.string().min(1) }).safeParse(await c.req.json());
  if (!parsed.success) {
    return c.json({ success: false, errors: parsed.error.issues.map((i) => i.message) }, 400);
  }
  const stub = getDOStub(c.env, c.req.param("id"));
  const result = await stub.fetch("http://do/command", {
    method: "POST",
    body: JSON.stringify({
      type: "RequestRevision",
      intakeId: c.req.param("id"),
      notes: parsed.data.notes,
      _meta: buildMeta("coordinator"),
    }),
    headers: { "Content-Type": "application/json" },
  });
  return result;
});

// RESO Export
app.get("/admin/intakes/:id/export/reso", async (c) => {
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
});

// MLS Push (RESO Web API Add/Edit)
app.post("/admin/intakes/:id/mls/push", async (c) => {
  const parsed = z
    .object({
      baseUrl: z.string().url(),
      resourceName: z.string().min(1),
      auth: z.object({
        clientId: z.string().min(1),
        clientSecret: z.string().min(1),
        tokenEndpoint: z.string().url(),
        scope: z.string().optional(),
      }),
    })
    .safeParse(await c.req.json());
  if (!parsed.success) {
    return c.json({ success: false, errors: parsed.error.issues.map((i) => i.message) }, 400);
  }

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

  const connector = createMLSConnector(parsed.data);
  const result = await connector.createListing(payload);
  return c.json(result);
});

// Document upload signed URL (R2)
app.get("/intakes/:id/documents/upload-url", async (c) => {
  const documentType = c.req.query("documentType");
  const fileName = c.req.query("fileName");
  if (!documentType || !fileName) {
    return c.json({ success: false, errors: ["Missing documentType or fileName"] }, 400);
  }
  const key = `intakes/${c.req.param("id")}/${crypto.randomUUID()}/${fileName}`;
  // R2 buckets in Workers don't have a direct createSignedUrl API in the binding.
  // We return the key and a PUT URL pattern for clients that upload via a presigned endpoint.
  // For direct R2 binding usage, the client must PUT via the Worker proxy.
  return c.json({ success: true, data: { storageKey: key, uploadUrl: `/intakes/${c.req.param("id")}/documents/direct-upload?key=${encodeURIComponent(key)}` } });
});

app.put("/intakes/:id/documents/direct-upload", async (c) => {
  const key = c.req.query("key");
  if (!key) return c.json({ success: false, errors: ["Missing key"] }, 400);
  const contentType = c.req.raw.headers.get("content-type") || "application/octet-stream";
  await c.env.DOCUMENTS_BUCKET.put(key, c.req.raw.body, { httpMetadata: { contentType } });
  return c.json({ success: true, data: { storageKey: key } });
});

// Webhooks
app.post("/webhooks/document-extracted", async (c) => {
  const secret = c.env.WEBHOOK_SECRET;
  if (secret) {
    const signature = c.req.raw.headers.get("x-webhook-signature") || "";
    const payload = await c.req.text();
    const valid = await verifyWebhookSignature(payload, signature, secret);
    if (!valid) {
      return c.json({ success: false, errors: ["Invalid signature"] }, 401);
    }
    // Re-parse for downstream use if needed
    try {
      JSON.parse(payload);
    } catch {
      return c.json({ success: false, errors: ["Invalid JSON"] }, 400);
    }
  }
  return c.json({ received: true });
});

app.post("/webhooks/email-events", async (c) => {
  return c.json({ received: true });
});

export { app as apiRoutes };
