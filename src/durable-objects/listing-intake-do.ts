import type {
  IntakeStage,
  IntakeStatus,
  DocumentType,
  SectionKey,
} from "~/domains/types.js";
import type {
  CommandResult,
  CreateIntakeCommand,
  UpdateSectionCommand,
  SubmitIntakeCommand,
  ApproveIntakeCommand,
  BlockIntakeCommand,
  UploadDocumentCommand,
  AssignCoordinatorCommand,
  InviteSellerCommand,
  StartReviewCommand,
  RequestRevisionCommand,
} from "~/domains/commands.js";
import {
  canTransitionStatus,
  advanceStage,
} from "~/domains/state-machine.js";
import { calculateCompletionPercent } from "~/lib/scoring.js";
import { z } from "zod";
import {
  zPropertyDetailsSection,
  zAccessShowingsSection,
} from "~/schemas/index.js";
import type { DomainEvent } from "~/events/types.js";

interface SectionState {
  status: string;
  payload: Record<string, unknown>;
  version: number;
}

interface ChecklistItem {
  status: string;
}

interface DOStateSnapshot {
  intakeId: string;
  orgId: string;
  assignedCoordinatorId: string;
  status: IntakeStatus;
  currentStage: IntakeStage;
  sections: [string, SectionState][];
  completionPercent: number;
  readinessScore: number;
  checklist: [string, ChecklistItem][];
  documents: string[];
}

export class ListingIntakeDO implements DurableObject {
  private intakeId = "";
  private orgId = "";
  private assignedCoordinatorId = "";
  private status: IntakeStatus = "draft";
  private currentStage: IntakeStage = "contact_info";
  private sections = new Map<string, SectionState>();
  private completionPercent = 0;
  private readinessScore = 0;
  private checklist = new Map<string, ChecklistItem>();
  private documents: string[] = [];

  constructor(private ctx: DurableObjectState) {}

  private async persist(): Promise<void> {
    const snapshot: DOStateSnapshot = {
      intakeId: this.intakeId,
      orgId: this.orgId,
      assignedCoordinatorId: this.assignedCoordinatorId,
      status: this.status,
      currentStage: this.currentStage,
      sections: Array.from(this.sections.entries()),
      completionPercent: this.completionPercent,
      readinessScore: this.readinessScore,
      checklist: Array.from(this.checklist.entries()),
      documents: this.documents,
    };
    await this.ctx.storage.put("state", snapshot);
  }

  private async load(): Promise<void> {
    const state = await this.ctx.storage.get<DOStateSnapshot>("state");
    if (state) {
      this.intakeId = state.intakeId ?? "";
      this.orgId = state.orgId ?? "";
      this.assignedCoordinatorId = state.assignedCoordinatorId ?? "";
      this.status = state.status ?? "draft";
      this.currentStage = state.currentStage ?? "contact_info";
      this.sections = new Map(state.sections ?? []);
      this.completionPercent = state.completionPercent ?? 0;
      this.readinessScore = state.readinessScore ?? 0;
      this.checklist = new Map(state.checklist ?? []);
      this.documents = state.documents ?? [];
    }
  }

  private areRequiredTasksComplete(): boolean {
    if (this.checklist.size === 0) return false;
    for (const item of this.checklist.values()) {
      if (item.status !== "complete" && item.status !== "waived") {
        return false;
      }
    }
    return true;
  }

  private sectionsRecord(): Record<string, { status: string }> {
    return Object.fromEntries(
      Array.from(this.sections.entries()).map(([k, v]) => [k, { status: v.status }])
    );
  }

  private makeEvent(event: DomainEvent): DomainEvent {
    return event;
  }

  async createIntake(
    cmd: CreateIntakeCommand
  ): Promise<CommandResult<{ intakeId: string }>> {
    await this.load();
    if (this.intakeId) {
      return { success: false, events: [], errors: ["Intake already exists"] };
    }
    this.intakeId = crypto.randomUUID();
    this.orgId = cmd.orgId;
    this.status = "draft";
    this.currentStage = "contact_info";
    await this.persist();
    const event = this.makeEvent({
      eventType: "IntakeCreated",
      aggregateType: "listing_intake",
      aggregateId: this.intakeId,
      orgId: this.orgId,
      actorType: cmd._meta.actorType,
      actorUserId: cmd._meta.actorUserId,
      payload: {
        propertyId: cmd.propertyId,
        clientId: cmd.clientId,
        assignedAgentId: cmd.assignedAgentId,
        source: cmd.source,
      },
      timestamp: new Date().toISOString(),
    });
    return {
      success: true,
      data: { intakeId: this.intakeId },
      events: [event],
    };
  }

  async inviteSeller(cmd: InviteSellerCommand): Promise<CommandResult> {
    await this.load();
    const event = this.makeEvent({
      eventType: "SellerInvited",
      aggregateType: "listing_intake",
      aggregateId: this.intakeId,
      orgId: this.orgId,
      actorType: cmd._meta.actorType,
      actorUserId: cmd._meta.actorUserId,
      payload: {
        intakeId: this.intakeId,
        email: cmd.sellerEmail,
        inviteToken: crypto.randomUUID(),
      },
      timestamp: new Date().toISOString(),
    });
    return { success: true, events: [event] };
  }

  async updateSection(cmd: UpdateSectionCommand): Promise<CommandResult> {
    await this.load();
    const validSections = new Set<string>([
      "contact_info",
      "property_details",
      "ownership_disclosures",
      "access_showings",
      "media_condition",
      "pricing_goals",
      "review_submit",
    ]);
    if (!validSections.has(cmd.sectionKey)) {
      return {
        success: false,
        events: [],
        errors: [`Unknown section key: ${cmd.sectionKey}`],
      };
    }

    let isValid = true;
    let schema: z.ZodType<Record<string, unknown>> | undefined;
    if (cmd.sectionKey === "property_details") {
      schema = zPropertyDetailsSection;
    } else if (cmd.sectionKey === "access_showings") {
      schema = zAccessShowingsSection;
    }
    if (schema) {
      const result = schema.safeParse(cmd.payload);
      isValid = result.success;
    }
    const version = (this.sections.get(cmd.sectionKey)?.version ?? 0) + 1;
    this.sections.set(cmd.sectionKey, {
      status: isValid ? "complete" : "in_progress",
      payload: cmd.payload,
      version,
    });
    this.completionPercent = calculateCompletionPercent(
      Object.fromEntries(
        Array.from(this.sections.entries()).map(([k, v]) => [k, v])
      )
    );
    await this.persist();
    const event = this.makeEvent({
      eventType: "SectionUpdated",
      aggregateType: "listing_intake",
      aggregateId: this.intakeId,
      orgId: this.orgId,
      actorType: cmd._meta.actorType,
      actorUserId: cmd._meta.actorUserId,
      payload: {
        intakeId: this.intakeId,
        sectionKey: cmd.sectionKey as SectionKey,
        version,
      },
      timestamp: new Date().toISOString(),
    });
    return { success: true, events: [event] };
  }

  async submitIntake(cmd: SubmitIntakeCommand): Promise<CommandResult> {
    await this.load();
    const can = canTransitionStatus(this.status, "submitted", {
      sections: this.sectionsRecord(),
      issues: [],
      readinessScore: this.readinessScore,
      requiredTasksComplete: this.areRequiredTasksComplete(),
      role: cmd._meta.role,
    });
    if (!can) {
      return {
        success: false,
        events: [],
        errors: ["Cannot submit intake from current state"],
      };
    }
    this.status = "submitted";
    this.currentStage = advanceStage(
      this.currentStage,
      this.sectionsRecord(),
      this.status
    );
    await this.persist();
    const event = this.makeEvent({
      eventType: "IntakeSubmitted",
      aggregateType: "listing_intake",
      aggregateId: this.intakeId,
      orgId: this.orgId,
      actorType: cmd._meta.actorType,
      actorUserId: cmd._meta.actorUserId,
      payload: { intakeId: this.intakeId },
      timestamp: new Date().toISOString(),
    });
    return { success: true, events: [event] };
  }

  async startReview(cmd: StartReviewCommand): Promise<CommandResult> {
    await this.load();
    const can = canTransitionStatus(this.status, "under_review", {
      sections: this.sectionsRecord(),
      issues: [],
      readinessScore: this.readinessScore,
      requiredTasksComplete: this.areRequiredTasksComplete(),
      role: cmd._meta.role,
    });
    if (!can) {
      return {
        success: false,
        events: [],
        errors: ["Cannot start review from current state"],
      };
    }
    this.status = "under_review";
    await this.persist();
    const event = this.makeEvent({
      eventType: "ReviewStarted",
      aggregateType: "listing_intake",
      aggregateId: this.intakeId,
      orgId: this.orgId,
      actorType: cmd._meta.actorType,
      actorUserId: cmd._meta.actorUserId,
      payload: { intakeId: this.intakeId },
      timestamp: new Date().toISOString(),
    });
    return { success: true, events: [event] };
  }

  async approveIntake(cmd: ApproveIntakeCommand): Promise<CommandResult> {
    await this.load();
    const can = canTransitionStatus(this.status, "approved", {
      sections: this.sectionsRecord(),
      issues: [],
      readinessScore: this.readinessScore,
      requiredTasksComplete: this.areRequiredTasksComplete(),
      role: cmd._meta.role,
    });
    if (!can) {
      return {
        success: false,
        events: [],
        errors: ["Cannot approve intake"],
      };
    }
    this.status = "approved";
    await this.persist();
    const event = this.makeEvent({
      eventType: "IntakeApproved",
      aggregateType: "listing_intake",
      aggregateId: this.intakeId,
      orgId: this.orgId,
      actorType: cmd._meta.actorType,
      actorUserId: cmd._meta.actorUserId,
      payload: { intakeId: this.intakeId, notes: cmd.notes },
      timestamp: new Date().toISOString(),
    });
    return { success: true, events: [event] };
  }

  async blockIntake(cmd: BlockIntakeCommand): Promise<CommandResult> {
    await this.load();
    const can = canTransitionStatus(this.status, "blocked", {
      sections: this.sectionsRecord(),
      issues: [],
      readinessScore: this.readinessScore,
      requiredTasksComplete: this.areRequiredTasksComplete(),
      role: cmd._meta.role,
    });
    if (!can) {
      return {
        success: false,
        events: [],
        errors: ["Cannot block intake from current state"],
      };
    }
    this.status = "blocked";
    await this.persist();
    const event = this.makeEvent({
      eventType: "IntakeBlocked",
      aggregateType: "listing_intake",
      aggregateId: this.intakeId,
      orgId: this.orgId,
      actorType: cmd._meta.actorType,
      actorUserId: cmd._meta.actorUserId,
      payload: { intakeId: this.intakeId, reason: cmd.reason },
      timestamp: new Date().toISOString(),
    });
    return { success: true, events: [event] };
  }

  async requestRevision(cmd: RequestRevisionCommand): Promise<CommandResult> {
    await this.load();
    const can = canTransitionStatus(this.status, "in_progress", {
      sections: this.sectionsRecord(),
      issues: [],
      readinessScore: this.readinessScore,
      requiredTasksComplete: this.areRequiredTasksComplete(),
      role: cmd._meta.role,
    });
    if (!can) {
      return {
        success: false,
        events: [],
        errors: ["Cannot request revision from current state"],
      };
    }
    this.status = "in_progress";
    await this.persist();
    const event = this.makeEvent({
      eventType: "RevisionRequested",
      aggregateType: "listing_intake",
      aggregateId: this.intakeId,
      orgId: this.orgId,
      actorType: cmd._meta.actorType,
      actorUserId: cmd._meta.actorUserId,
      payload: { intakeId: this.intakeId, notes: cmd.notes },
      timestamp: new Date().toISOString(),
    });
    return { success: true, events: [event] };
  }

  async uploadDocument(
    cmd: UploadDocumentCommand
  ): Promise<CommandResult<{ documentId: string }>> {
    await this.load();
    const documentId = crypto.randomUUID();
    this.documents.push(documentId);
    await this.persist();
    const event = this.makeEvent({
      eventType: "DocumentUploaded",
      aggregateType: "listing_intake",
      aggregateId: this.intakeId,
      orgId: this.orgId,
      actorType: cmd._meta.actorType,
      actorUserId: cmd._meta.actorUserId,
      payload: {
        intakeId: this.intakeId,
        documentId,
        documentType: cmd.documentType as DocumentType,
        fileName: cmd.fileName,
        fileSizeBytes: cmd.fileSizeBytes,
      },
      timestamp: new Date().toISOString(),
    });
    return {
      success: true,
      data: { documentId },
      events: [event],
    };
  }

  async assignCoordinator(
    cmd: AssignCoordinatorCommand
  ): Promise<CommandResult> {
    await this.load();
    const previousCoordinatorId = this.assignedCoordinatorId;
    this.assignedCoordinatorId = cmd.coordinatorId;
    await this.persist();
    const event = this.makeEvent({
      eventType: "CoordinatorAssigned",
      aggregateType: "listing_intake",
      aggregateId: this.intakeId,
      orgId: this.orgId,
      actorType: cmd._meta.actorType,
      actorUserId: cmd._meta.actorUserId,
      payload: {
        intakeId: this.intakeId,
        coordinatorId: cmd.coordinatorId,
        previousCoordinatorId: previousCoordinatorId || undefined,
      },
      timestamp: new Date().toISOString(),
    });
    return { success: true, events: [event] };
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "POST" && url.pathname === "/command") {
      const raw = await request.json();
      if (!raw || typeof raw !== "object" || !("type" in raw)) {
        return Response.json(
          { success: false, events: [], errors: ["Invalid command body"] },
          { status: 400 }
        );
      }
      const body = raw as Record<string, unknown>;
      let result: CommandResult;
      switch (body.type) {
        case "CreateIntake":
          if (
            typeof body.orgId !== "string" ||
            typeof body.propertyId !== "string" ||
            typeof body.clientId !== "string"
          ) {
            return Response.json(
              { success: false, events: [], errors: ["Missing required fields for CreateIntake"] },
              { status: 400 }
            );
          }
          result = await this.createIntake(body as unknown as CreateIntakeCommand);
          break;
        case "InviteSeller":
          if (typeof body.sellerEmail !== "string") {
            return Response.json(
              { success: false, events: [], errors: ["Missing sellerEmail"] },
              { status: 400 }
            );
          }
          result = await this.inviteSeller(body as unknown as InviteSellerCommand);
          break;
        case "UpdateSection":
          if (
            typeof body.sectionKey !== "string" ||
            !body.payload ||
            typeof body.payload !== "object"
          ) {
            return Response.json(
              { success: false, events: [], errors: ["Missing sectionKey or payload"] },
              { status: 400 }
            );
          }
          result = await this.updateSection(body as unknown as UpdateSectionCommand);
          break;
        case "SubmitIntake":
          result = await this.submitIntake(body as unknown as SubmitIntakeCommand);
          break;
        case "StartReview":
          result = await this.startReview(body as unknown as StartReviewCommand);
          break;
        case "ApproveIntake":
          result = await this.approveIntake(body as unknown as ApproveIntakeCommand);
          break;
        case "BlockIntake":
          if (typeof body.reason !== "string") {
            return Response.json(
              { success: false, events: [], errors: ["Missing reason"] },
              { status: 400 }
            );
          }
          result = await this.blockIntake(body as unknown as BlockIntakeCommand);
          break;
        case "RequestRevision":
          if (typeof body.notes !== "string") {
            return Response.json(
              { success: false, events: [], errors: ["Missing notes"] },
              { status: 400 }
            );
          }
          result = await this.requestRevision(body as unknown as RequestRevisionCommand);
          break;
        case "UploadDocument":
          if (
            typeof body.documentType !== "string" ||
            typeof body.fileName !== "string" ||
            typeof body.storageKey !== "string" ||
            typeof body.fileSizeBytes !== "number"
          ) {
            return Response.json(
              { success: false, events: [], errors: ["Missing document fields"] },
              { status: 400 }
            );
          }
          result = await this.uploadDocument(body as unknown as UploadDocumentCommand);
          break;
        case "AssignCoordinator":
          if (typeof body.coordinatorId !== "string") {
            return Response.json(
              { success: false, events: [], errors: ["Missing coordinatorId"] },
              { status: 400 }
            );
          }
          result = await this.assignCoordinator(body as unknown as AssignCoordinatorCommand);
          break;
        default:
          result = { success: false, events: [], errors: ["Unknown command type"] };
      }
      return Response.json(result);
    }

    await this.load();
    return Response.json(
      {
        intakeId: this.intakeId,
        orgId: this.orgId,
        assignedCoordinatorId: this.assignedCoordinatorId,
        status: this.status,
        currentStage: this.currentStage,
        completionPercent: this.completionPercent,
        readinessScore: this.readinessScore,
        sections: Object.fromEntries(this.sections),
        documents: this.documents,
      },
      { status: 200 }
    );
  }
}
