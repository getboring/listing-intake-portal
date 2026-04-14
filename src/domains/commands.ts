import type { CommandContext, MessageChannel } from "./types.js";
import type { DomainEvent } from "../events/types.js";

export interface CommandResult<T = unknown> {
  success: boolean;
  events: DomainEvent[];
  data?: T;
  errors?: string[];
}

export interface CreateIntakeCommand {
  type: "CreateIntake";
  propertyId: string;
  clientId: string;
  orgId: string;
  assignedAgentId?: string;
  source?: string;
  _meta: CommandContext;
}

export interface InviteSellerCommand {
  type: "InviteSeller";
  intakeId: string;
  sellerEmail: string;
  _meta: CommandContext;
}

export interface UpdateSectionCommand {
  type: "UpdateSection";
  intakeId: string;
  sectionKey: string;
  payload: Record<string, unknown>;
  _meta: CommandContext;
}

export interface UploadDocumentCommand {
  type: "UploadDocument";
  intakeId: string;
  documentType: string;
  fileName: string;
  storageKey: string;
  fileSizeBytes: number;
  checksumSha256?: string;
  _meta: CommandContext;
}

export interface RunValidationCommand {
  type: "RunValidation";
  intakeId: string;
  _meta: CommandContext;
}

export interface SubmitIntakeCommand {
  type: "SubmitIntake";
  intakeId: string;
  _meta: CommandContext;
}

export interface ApproveIntakeCommand {
  type: "ApproveIntake";
  intakeId: string;
  notes?: string;
  _meta: CommandContext;
}

export interface BlockIntakeCommand {
  type: "BlockIntake";
  intakeId: string;
  reason: string;
  _meta: CommandContext;
}

export interface StartReviewCommand {
  type: "StartReview";
  intakeId: string;
  _meta: CommandContext;
}

export interface RequestRevisionCommand {
  type: "RequestRevision";
  intakeId: string;
  notes: string;
  _meta: CommandContext;
}

export interface GenerateTasksCommand {
  type: "GenerateTasks";
  intakeId: string;
  _meta: CommandContext;
}

export interface SendReminderCommand {
  type: "SendReminder";
  intakeId: string;
  channel: MessageChannel;
  _meta: CommandContext;
}

export interface AssignCoordinatorCommand {
  type: "AssignCoordinator";
  intakeId: string;
  coordinatorId: string;
  _meta: CommandContext;
}

export type IntakeCommand =
  | CreateIntakeCommand
  | InviteSellerCommand
  | UpdateSectionCommand
  | UploadDocumentCommand
  | RunValidationCommand
  | SubmitIntakeCommand
  | ApproveIntakeCommand
  | BlockIntakeCommand
  | StartReviewCommand
  | RequestRevisionCommand
  | GenerateTasksCommand
  | SendReminderCommand
  | AssignCoordinatorCommand;
