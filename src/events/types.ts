import type { ActorType, DocumentType, MessageChannel, SectionKey, TaskType, ValidationIssue } from "../domains/types";

export interface EventBase<T extends string, P> {
  eventType: T;
  aggregateType: "listing_intake" | "task" | "document" | "conversation";
  aggregateId: string;
  orgId: string;
  actorUserId?: string;
  actorType: ActorType;
  payload: P;
  timestamp: string;
}

export type IntakeCreatedEvent = EventBase<
  "IntakeCreated",
  {
    propertyId: string;
    clientId: string;
    assignedAgentId?: string;
    source?: string;
  }
>;

export type SellerInvitedEvent = EventBase<
  "SellerInvited",
  {
    intakeId: string;
    email: string;
    inviteToken: string;
  }
>;

export type SectionUpdatedEvent = EventBase<
  "SectionUpdated",
  {
    intakeId: string;
    sectionKey: SectionKey;
    version: number;
  }
>;

export type DocumentUploadedEvent = EventBase<
  "DocumentUploaded",
  {
    intakeId: string;
    documentId: string;
    documentType: DocumentType;
    fileName: string;
    fileSizeBytes: number;
  }
>;

export type DocumentExtractedEvent = EventBase<
  "DocumentExtracted",
  {
    intakeId: string;
    documentId: string;
    extractedFields: Record<string, unknown>;
    confidenceScore: number;
  }
>;

export type ValidationRunEvent = EventBase<
  "ValidationRun",
  {
    intakeId: string;
    sectionKey?: string;
    issues: ValidationIssue[];
    passed: boolean;
  }
>;

export type IntakeSubmittedEvent = EventBase<
  "IntakeSubmitted",
  {
    intakeId: string;
    submissionIp?: string;
    userAgent?: string;
  }
>;

export type IntakeApprovedEvent = EventBase<
  "IntakeApproved",
  {
    intakeId: string;
    approvedPrice?: number;
    notes?: string;
  }
>;

export type IntakeBlockedEvent = EventBase<
  "IntakeBlocked",
  {
    intakeId: string;
    reason: string;
  }
>;

export type TasksGeneratedEvent = EventBase<
  "TasksGenerated",
  {
    intakeId: string;
    taskTypes: TaskType[];
    count: number;
  }
>;

export type ReminderSentEvent = EventBase<
  "ReminderSent",
  {
    intakeId: string;
    channel: MessageChannel;
    templateId: string;
    openedAt?: string;
  }
>;

export type CoordinatorAssignedEvent = EventBase<
  "CoordinatorAssigned",
  {
    intakeId: string;
    coordinatorId: string;
    previousCoordinatorId?: string;
  }
>;

export type ReviewStartedEvent = EventBase<
  "ReviewStarted",
  {
    intakeId: string;
  }
>;

export type RevisionRequestedEvent = EventBase<
  "RevisionRequested",
  {
    intakeId: string;
    notes: string;
  }
>;

export type DomainEvent =
  | IntakeCreatedEvent
  | SellerInvitedEvent
  | SectionUpdatedEvent
  | DocumentUploadedEvent
  | DocumentExtractedEvent
  | ValidationRunEvent
  | IntakeSubmittedEvent
  | IntakeApprovedEvent
  | IntakeBlockedEvent
  | TasksGeneratedEvent
  | ReminderSentEvent
  | CoordinatorAssignedEvent
  | ReviewStartedEvent
  | RevisionRequestedEvent;
