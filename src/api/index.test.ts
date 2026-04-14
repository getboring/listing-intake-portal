import { describe, it, expect, vi, beforeEach } from "vitest";
import { apiRoutes, getDOStub } from "./index.js";
import type { Env } from "~/lib/env.js";

function createMockEnv(): Env {
  return {
    DB: {} as D1Database,
    LISTING_INTAKE_DO: {
      idFromName: vi.fn((name: string) => ({ toString: () => `id-${name}` } as DurableObjectId)),
      get: vi.fn((id: DurableObjectId) => ({
        fetch: vi.fn(async () => new Response(JSON.stringify({ success: true }), { status: 200 })),
        id,
      } as unknown as DurableObjectStub)),
      newUniqueId: vi.fn(),
      jurisdiction: vi.fn(),
    } as unknown as DurableObjectNamespace,
    DOCUMENTS_BUCKET: {} as R2Bucket,
    INTAKE_QUEUE: {} as Queue,
  };
}

describe("api/index", () => {
  let env: Env;

  beforeEach(() => {
    env = createMockEnv();
  });

  describe("getDOStub", () => {
    it("uses idFromName correctly", () => {
      const stub = getDOStub(env, "intake-123");
      expect(env.LISTING_INTAKE_DO.idFromName).toHaveBeenCalledWith("intake-123");
      expect(stub).toBeDefined();
    });
  });

  describe("route mounting", () => {
    it("mounts health route", async () => {
      const res = await apiRoutes.request("/health", { method: "GET" }, env);
      // With mocked DB/DO, health returns 503; we just verify the route is wired.
      expect(res.status === 200 || res.status === 503).toBe(true);
      const json = await res.json() as Record<string, unknown>;
      expect(json).toHaveProperty("status");
      expect(json).toHaveProperty("db");
      expect(json).toHaveProperty("do");
    });

    it("mounts seller routes", async () => {
      const sellerRoutes = [
        { method: "POST", path: "/intakes/123/accept-invite" },
        { method: "GET", path: "/intakes/123" },
        { method: "PATCH", path: "/intakes/123/sections/property_details" },
        { method: "POST", path: "/intakes/123/documents" },
        { method: "POST", path: "/intakes/123/submit" },
      ];

      for (const route of sellerRoutes) {
        const res = await apiRoutes.request(
          route.path,
          { method: route.method, body: route.method !== "GET" ? JSON.stringify({}) : undefined },
          env
        );
        expect(res.status).not.toBe(404);
      }
    });

    it("mounts admin routes", async () => {
      const adminRoutes = [
        { method: "GET", path: "/admin/intakes" },
        { method: "GET", path: "/admin/intakes/123" },
        { method: "POST", path: "/admin/intakes/123/assign" },
        { method: "POST", path: "/admin/intakes/123/start-review" },
        { method: "POST", path: "/admin/intakes/123/approve" },
        { method: "POST", path: "/admin/intakes/123/block" },
        { method: "POST", path: "/admin/intakes/123/request-revision" },
        { method: "GET", path: "/admin/intakes/123/export/reso" },
        { method: "POST", path: "/admin/intakes/123/mls/push" },
      ];

      for (const route of adminRoutes) {
        const res = await apiRoutes.request(
          route.path,
          { method: route.method, body: route.method !== "GET" ? JSON.stringify({}) : undefined },
          env
        );
        expect(res.status).not.toBe(404);
      }
    });

    it("mounts webhook routes", async () => {
      const webhookRoutes = [
        { method: "POST", path: "/webhooks/document-extracted" },
        { method: "POST", path: "/webhooks/email-events" },
      ];

      for (const route of webhookRoutes) {
        const res = await apiRoutes.request(
          route.path,
          { method: route.method, body: JSON.stringify({}) },
          env
        );
        expect(res.status).not.toBe(404);
      }
    });
  });

  describe("Zod validation returns 400 on bad input", () => {
    it("POST /intakes/:id/accept-invite returns 400 for invalid email", async () => {
      const res = await apiRoutes.request(
        "/intakes/123/accept-invite",
        {
          method: "POST",
          body: JSON.stringify({ sellerEmail: "not-an-email" }),
          headers: { "Content-Type": "application/json" },
        },
        env
      );
      expect(res.status).toBe(400);
      const json = await res.json() as Record<string, unknown>;
      expect(json.success).toBe(false);
    });

    it("PATCH /intakes/:id/sections/:sectionKey returns 400 for invalid payload", async () => {
      const res = await apiRoutes.request(
        "/intakes/123/sections/property_details",
        {
          method: "PATCH",
          body: JSON.stringify({ propertyType: 123 }),
          headers: { "Content-Type": "application/json" },
        },
        env
      );
      expect(res.status).toBe(400);
      const json = await res.json() as Record<string, unknown>;
      expect(json.success).toBe(false);
    });

    it("POST /intakes/:id/documents returns 400 for missing fields", async () => {
      const res = await apiRoutes.request(
        "/intakes/123/documents",
        {
          method: "POST",
          body: JSON.stringify({ fileName: "x.pdf" }),
          headers: { "Content-Type": "application/json" },
        },
        env
      );
      expect(res.status).toBe(400);
      const json = await res.json() as Record<string, unknown>;
      expect(json.success).toBe(false);
    });

    it("POST /admin/intakes/:id/assign returns 400 for empty coordinatorId", async () => {
      const res = await apiRoutes.request(
        "/admin/intakes/123/assign",
        {
          method: "POST",
          body: JSON.stringify({ coordinatorId: "" }),
          headers: { "Content-Type": "application/json" },
        },
        env
      );
      expect(res.status).toBe(400);
      const json = await res.json() as Record<string, unknown>;
      expect(json.success).toBe(false);
    });

    it("POST /admin/intakes/:id/approve returns 400 for invalid body", async () => {
      const res = await apiRoutes.request(
        "/admin/intakes/123/approve",
        {
          method: "POST",
          body: JSON.stringify({ notes: 123 }),
          headers: { "Content-Type": "application/json" },
        },
        env
      );
      expect(res.status).toBe(400);
      const json = await res.json() as Record<string, unknown>;
      expect(json.success).toBe(false);
    });

    it("POST /admin/intakes/:id/block returns 400 for empty reason", async () => {
      const res = await apiRoutes.request(
        "/admin/intakes/123/block",
        {
          method: "POST",
          body: JSON.stringify({ reason: "" }),
          headers: { "Content-Type": "application/json" },
        },
        env
      );
      expect(res.status).toBe(400);
      const json = await res.json() as Record<string, unknown>;
      expect(json.success).toBe(false);
    });

    it("POST /admin/intakes/:id/start-review returns non-404", async () => {
      const res = await apiRoutes.request(
        "/admin/intakes/123/start-review",
        {
          method: "POST",
          body: JSON.stringify({}),
          headers: { "Content-Type": "application/json" },
        },
        env
      );
      expect(res.status).not.toBe(404);
    });

    it("POST /admin/intakes/:id/request-revision returns 400 for empty notes", async () => {
      const res = await apiRoutes.request(
        "/admin/intakes/123/request-revision",
        {
          method: "POST",
          body: JSON.stringify({ notes: "" }),
          headers: { "Content-Type": "application/json" },
        },
        env
      );
      expect(res.status).toBe(400);
      const json = await res.json() as Record<string, unknown>;
      expect(json.success).toBe(false);
    });

    it("POST /admin/intakes/:id/mls/push returns error when DB unavailable", async () => {
      const res = await apiRoutes.request(
        "/admin/intakes/123/mls/push",
        {
          method: "POST",
          body: JSON.stringify({}),
          headers: { "Content-Type": "application/json" },
        },
        env
      );
      // Mock DB is non-functional, so the route returns 502 after catching the error
      expect(res.status).toBe(502);
      const json = await res.json() as Record<string, unknown>;
      expect(json.success).toBe(false);
    });
  });
});
