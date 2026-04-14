import { describe, it, expect, beforeEach, vi } from "vitest";
import { ListingIntakeDO } from "./listing-intake-do.js";
import type { DurableObjectState } from "@cloudflare/workers-types";
import type {
  CreateIntakeCommand,
  UpdateSectionCommand,
  SubmitIntakeCommand,
  ApproveIntakeCommand,
  BlockIntakeCommand,
  UploadDocumentCommand,
  AssignCoordinatorCommand,
  StartReviewCommand,
  RequestRevisionCommand,
} from "~/domains/commands.js";

function createMockState(): DurableObjectState {
  const store = new Map<string, unknown>();
  return {
    storage: {
      get: vi.fn(async <T>(key: string): Promise<T | undefined> => {
        return store.get(key) as T | undefined;
      }),
      put: vi.fn(async (key: string, value: unknown): Promise<void> => {
        store.set(key, value);
      }),
      delete: vi.fn(async (key: string): Promise<boolean> => {
        return store.delete(key);
      }),
      deleteAll: vi.fn(async (): Promise<void> => {
        store.clear();
      }),
      list: vi.fn(async (): Promise<Map<string, unknown>> => {
        return new Map(store);
      }),
      getAlarm: vi.fn(async (): Promise<number | null> => null),
      setAlarm: vi.fn(async (): Promise<void> => {}),
      deleteAlarm: vi.fn(async (): Promise<void> => {}),
      transaction: vi.fn(async <T>(closure: () => Promise<T>): Promise<T> => {
        return closure();
      }),
      sql: undefined as unknown as Storage,
    },
    id: {
      toString: () => "mock-do-id",
      equals: () => true,
    },
    waitUntil: vi.fn(),
    acceptWebSocket: vi.fn(),
    getWebSockets: vi.fn(() => []),
    setWebSocketAutoResponse: vi.fn(),
    getTags: vi.fn(async () => []),
    getStub: vi.fn(),
  } as unknown as DurableObjectState;
}

function baseMeta(role: "seller" | "agent" | "coordinator" | "admin" = "seller") {
  return {
    actorType: "seller" as const,
    actorUserId: "user-1",
    role,
    timestamp: new Date().toISOString(),
  };
}

async function seedState(
  mockState: DurableObjectState,
  partial: Record<string, unknown>
): Promise<void> {
  const existing = (await mockState.storage.get<Record<string, unknown>>("state")) ?? {};
  await mockState.storage.put("state", { ...existing, ...partial });
}

describe("ListingIntakeDO", () => {
  let mockState: DurableObjectState;
  let doInstance: ListingIntakeDO;

  beforeEach(() => {
    mockState = createMockState();
    // @ts-expect-error workers-types version mismatch in test environment
    doInstance = new ListingIntakeDO(mockState);
  });

  describe("createIntake", () => {
    it("returns success, emits IntakeCreated event, sets status to draft", async () => {
      const cmd: CreateIntakeCommand = {
        type: "CreateIntake",
        orgId: "org-1",
        propertyId: "prop-1",
        clientId: "client-1",
        assignedAgentId: "agent-1",
        source: "portal",
        _meta: baseMeta(),
      };

      const result = await doInstance.createIntake(cmd);

      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty("intakeId");
      expect(result.events).toHaveLength(1);
      expect(result.events[0].eventType).toBe("IntakeCreated");
      expect(result.events[0].payload).toMatchObject({
        propertyId: "prop-1",
        clientId: "client-1",
        assignedAgentId: "agent-1",
        source: "portal",
      });

      const state = await doInstance.fetch(new Request("http://do/"));
      const json = await state.json() as any;
      expect(json.status).toBe("draft");
      expect(json.orgId).toBe("org-1");
    });

    it("is idempotent and rejects duplicate createIntake calls", async () => {
      const cmd: CreateIntakeCommand = {
        type: "CreateIntake",
        orgId: "org-1",
        propertyId: "prop-1",
        clientId: "client-1",
        _meta: baseMeta(),
      };
      const first = await doInstance.createIntake(cmd);
      expect(first.success).toBe(true);

      const second = await doInstance.createIntake(cmd);
      expect(second.success).toBe(false);
      expect(second.errors).toContain("Intake already exists");
    });
  });

  describe("updateSection", () => {
    beforeEach(async () => {
      await doInstance.createIntake({
        type: "CreateIntake",
        orgId: "org-1",
        propertyId: "prop-1",
        clientId: "client-1",
        _meta: baseMeta(),
      });
    });

    it("marks section complete when payload is valid for property_details", async () => {
      const cmd: UpdateSectionCommand = {
        type: "UpdateSection",
        intakeId: "intake-1",
        sectionKey: "property_details",
        payload: {
          propertyType: "Residential",
          bedroomsTotal: 3,
          bathroomsTotalInteger: 2,
          occupancyStatus: "owner_occupied",
        },
        _meta: baseMeta(),
      };

      const result = await doInstance.updateSection(cmd);

      expect(result.success).toBe(true);
      expect(result.events[0].eventType).toBe("SectionUpdated");
      const stateRes = await doInstance.fetch(new Request("http://do/"));
      const json = await stateRes.json() as any;
      expect(json.sections.property_details.status).toBe("complete");
    });

    it("marks section in_progress when payload is invalid", async () => {
      const cmd: UpdateSectionCommand = {
        type: "UpdateSection",
        intakeId: "intake-1",
        sectionKey: "property_details",
        payload: {
          propertyType: "Residential",
          // missing bedroomsTotal and bathroomsTotalInteger
          occupancyStatus: "owner_occupied",
        },
        _meta: baseMeta(),
      };

      const result = await doInstance.updateSection(cmd);

      expect(result.success).toBe(true);
      const stateRes = await doInstance.fetch(new Request("http://do/"));
      const json = await stateRes.json() as any;
      expect(json.sections.property_details.status).toBe("in_progress");
    });

    it("returns error for unknown sectionKey", async () => {
      const cmd: UpdateSectionCommand = {
        type: "UpdateSection",
        intakeId: "intake-1",
        sectionKey: "unknown_section",
        payload: {},
        _meta: baseMeta(),
      };

      const result = await doInstance.updateSection(cmd);

      expect(result.success).toBe(false);
      expect(result.errors).toContain("Unknown section key: unknown_section");
    });
  });

  describe("submitIntake", () => {
    beforeEach(async () => {
      await doInstance.createIntake({
        type: "CreateIntake",
        orgId: "org-1",
        propertyId: "prop-1",
        clientId: "client-1",
        _meta: baseMeta(),
      });
    });

    it("succeeds when all required sections are complete", async () => {
      const requiredSections = [
        "contact_info",
        "property_details",
        "ownership_disclosures",
        "access_showings",
        "media_condition",
        "pricing_goals",
      ];

      for (const sectionKey of requiredSections) {
        const cmd: UpdateSectionCommand = {
          type: "UpdateSection",
          intakeId: "intake-1",
          sectionKey,
          payload: sectionKey === "access_showings"
            ? { occupancyStatus: "vacant", lockboxAllowed: false }
            : sectionKey === "property_details"
            ? { propertyType: "Land", lotSizeArea: 1000, occupancyStatus: "vacant" }
            : { someField: "value" },
          _meta: baseMeta(),
        };
        await doInstance.updateSection(cmd);
      }

      // Need to be in in_progress to submit
      await seedState(mockState, { status: "in_progress" });

      const cmd: SubmitIntakeCommand = {
        type: "SubmitIntake",
        intakeId: "intake-1",
        _meta: baseMeta(),
      };

      const result = await doInstance.submitIntake(cmd);
      expect(result.success).toBe(true);
      expect(result.events[0].eventType).toBe("IntakeSubmitted");
    });

    it("fails when sections are incomplete", async () => {
      await seedState(mockState, { status: "in_progress" });

      const cmd: SubmitIntakeCommand = {
        type: "SubmitIntake",
        intakeId: "intake-1",
        _meta: baseMeta(),
      };

      const result = await doInstance.submitIntake(cmd);
      expect(result.success).toBe(false);
      expect(result.errors).toContain("Cannot submit intake from current state");
    });
  });

  describe("startReview", () => {
    beforeEach(async () => {
      await doInstance.createIntake({
        type: "CreateIntake",
        orgId: "org-1",
        propertyId: "prop-1",
        clientId: "client-1",
        _meta: baseMeta(),
      });
    });

    it("succeeds from submitted", async () => {
      await seedState(mockState, { status: "submitted" });

      const cmd: StartReviewCommand = {
        type: "StartReview",
        intakeId: "intake-1",
        _meta: baseMeta("coordinator"),
      };

      const result = await doInstance.startReview(cmd);
      expect(result.success).toBe(true);
      expect(result.events[0].eventType).toBe("ReviewStarted");
    });

    it("fails from draft", async () => {
      const cmd: StartReviewCommand = {
        type: "StartReview",
        intakeId: "intake-1",
        _meta: baseMeta("coordinator"),
      };

      const result = await doInstance.startReview(cmd);
      expect(result.success).toBe(false);
      expect(result.errors).toContain("Cannot start review from current state");
    });
  });

  describe("approveIntake", () => {
    beforeEach(async () => {
      await doInstance.createIntake({
        type: "CreateIntake",
        orgId: "org-1",
        propertyId: "prop-1",
        clientId: "client-1",
        _meta: baseMeta(),
      });
    });

    it("fails when readinessScore < 60", async () => {
      await seedState(mockState, { status: "under_review", readinessScore: 50 });

      const cmd: ApproveIntakeCommand = {
        type: "ApproveIntake",
        intakeId: "intake-1",
        notes: "Looks good",
        _meta: baseMeta("coordinator"),
      };

      const result = await doInstance.approveIntake(cmd);
      expect(result.success).toBe(false);
      expect(result.errors).toContain("Cannot approve intake");
    });

    it("fails when checklist is empty (tasks not complete)", async () => {
      await seedState(mockState, { status: "under_review", readinessScore: 75 });

      const cmd: ApproveIntakeCommand = {
        type: "ApproveIntake",
        intakeId: "intake-1",
        notes: "Looks good",
        _meta: baseMeta("coordinator"),
      };

      const result = await doInstance.approveIntake(cmd);
      expect(result.success).toBe(false);
      expect(result.errors).toContain("Cannot approve intake");
    });

    it("succeeds when readinessScore >= 60 and tasks complete", async () => {
      await seedState(mockState, {
        status: "under_review",
        readinessScore: 75,
        checklist: [["task-1", { status: "complete" }]],
      });

      const cmd: ApproveIntakeCommand = {
        type: "ApproveIntake",
        intakeId: "intake-1",
        notes: "Looks good",
        _meta: baseMeta("coordinator"),
      };

      const result = await doInstance.approveIntake(cmd);
      expect(result.success).toBe(true);
      expect(result.events[0].eventType).toBe("IntakeApproved");
    });
  });

  describe("blockIntake", () => {
    beforeEach(async () => {
      await doInstance.createIntake({
        type: "CreateIntake",
        orgId: "org-1",
        propertyId: "prop-1",
        clientId: "client-1",
        _meta: baseMeta(),
      });
      await seedState(mockState, { status: "under_review" });
    });

    it("succeeds from under_review", async () => {
      const cmd: BlockIntakeCommand = {
        type: "BlockIntake",
        intakeId: "intake-1",
        reason: "Missing documents",
        _meta: baseMeta("coordinator"),
      };

      const result = await doInstance.blockIntake(cmd);
      expect(result.success).toBe(true);
      expect(result.events[0].eventType).toBe("IntakeBlocked");
    });
  });

  describe("requestRevision", () => {
    beforeEach(async () => {
      await doInstance.createIntake({
        type: "CreateIntake",
        orgId: "org-1",
        propertyId: "prop-1",
        clientId: "client-1",
        _meta: baseMeta(),
      });
    });

    it("succeeds from under_review and transitions to in_progress", async () => {
      await seedState(mockState, { status: "under_review" });

      const cmd: RequestRevisionCommand = {
        type: "RequestRevision",
        intakeId: "intake-1",
        notes: "Fix pricing",
        _meta: baseMeta("coordinator"),
      };

      const result = await doInstance.requestRevision(cmd);
      expect(result.success).toBe(true);
      expect(result.events[0].eventType).toBe("RevisionRequested");

      const stateRes = await doInstance.fetch(new Request("http://do/"));
      const json = await stateRes.json() as any;
      expect(json.status).toBe("in_progress");
    });
  });

  describe("uploadDocument", () => {
    beforeEach(async () => {
      await doInstance.createIntake({
        type: "CreateIntake",
        orgId: "org-1",
        propertyId: "prop-1",
        clientId: "client-1",
        _meta: baseMeta(),
      });
    });

    it("returns documentId and emits DocumentUploaded", async () => {
      const cmd: UploadDocumentCommand = {
        type: "UploadDocument",
        intakeId: "intake-1",
        documentType: "disclosure",
        fileName: "disclosure.pdf",
        storageKey: "s3/key",
        fileSizeBytes: 1024,
        _meta: baseMeta(),
      };

      const result = await doInstance.uploadDocument(cmd);

      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty("documentId");
      expect(result.events[0].eventType).toBe("DocumentUploaded");
      expect(result.events[0].payload).toMatchObject({
        documentType: "disclosure",
        fileName: "disclosure.pdf",
        fileSizeBytes: 1024,
      });
    });
  });

  describe("assignCoordinator", () => {
    beforeEach(async () => {
      await doInstance.createIntake({
        type: "CreateIntake",
        orgId: "org-1",
        propertyId: "prop-1",
        clientId: "client-1",
        _meta: baseMeta(),
      });
    });

    it("persists coordinatorId and emits CoordinatorAssigned", async () => {
      const cmd: AssignCoordinatorCommand = {
        type: "AssignCoordinator",
        intakeId: "intake-1",
        coordinatorId: "coord-123",
        _meta: baseMeta("agent"),
      };

      const result = await doInstance.assignCoordinator(cmd);

      expect(result.success).toBe(true);
      expect(result.events[0].eventType).toBe("CoordinatorAssigned");
      expect(result.events[0].payload).toMatchObject({
        coordinatorId: "coord-123",
      });

      const stateRes = await doInstance.fetch(new Request("http://do/"));
      const json = await stateRes.json() as any;
      expect(json.assignedCoordinatorId).toBe("coord-123");
    });
  });

  describe("fetch", () => {
    beforeEach(async () => {
      await doInstance.createIntake({
        type: "CreateIntake",
        orgId: "org-1",
        propertyId: "prop-1",
        clientId: "client-1",
        _meta: baseMeta(),
      });
    });

    it("GET returns current state after load", async () => {
      const res = await doInstance.fetch(new Request("http://do/"));
      expect(res.status).toBe(200);
      const json = await res.json() as any;
      expect(json).toMatchObject({
        orgId: "org-1",
        status: "draft",
        currentStage: "contact_info",
      });
      expect(json).toHaveProperty("intakeId");
    });

    it("POST /command with unknown type returns error", async () => {
      const res = await doInstance.fetch(
        new Request("http://do/command", {
          method: "POST",
          body: JSON.stringify({ type: "UnknownCommand" }),
          headers: { "Content-Type": "application/json" },
        })
      );
      expect(res.status).toBe(200);
      const json = await res.json() as any;
      expect(json.success).toBe(false);
      expect(json.errors).toContain("Unknown command type");
    });

    it("POST /command with invalid body returns 400", async () => {
      const res = await doInstance.fetch(
        new Request("http://do/command", {
          method: "POST",
          body: JSON.stringify({ notType: "oops" }),
          headers: { "Content-Type": "application/json" },
        })
      );
      expect(res.status).toBe(400);
      const json = await res.json() as any;
      expect(json.success).toBe(false);
      expect(json.errors).toContain("Invalid command body");
    });

    it("POST /command StartReview returns success from submitted", async () => {
      await seedState(mockState, { status: "submitted" });
      const res = await doInstance.fetch(
        new Request("http://do/command", {
          method: "POST",
          body: JSON.stringify({ type: "StartReview", intakeId: "intake-1", _meta: baseMeta("coordinator") }),
          headers: { "Content-Type": "application/json" },
        })
      );
      const json = await res.json() as any;
      expect(json.success).toBe(true);
      expect(json.events[0].eventType).toBe("ReviewStarted");
    });

    it("POST /command RequestRevision returns success from under_review", async () => {
      await seedState(mockState, { status: "under_review" });
      const res = await doInstance.fetch(
        new Request("http://do/command", {
          method: "POST",
          body: JSON.stringify({ type: "RequestRevision", intakeId: "intake-1", notes: "Fix it", _meta: baseMeta("coordinator") }),
          headers: { "Content-Type": "application/json" },
        })
      );
      const json = await res.json() as any;
      expect(json.success).toBe(true);
      expect(json.events[0].eventType).toBe("RevisionRequested");
    });
  });
});
