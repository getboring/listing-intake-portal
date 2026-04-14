import type { IntakeStage, IntakeStatus, SectionKey, UserRole, ValidationIssue } from "./types.js";

export interface TransitionContext {
  sections: Record<string, { status: string; payload?: unknown }>;
  issues: ValidationIssue[];
  readinessScore: number;
  requiredTasksComplete: boolean;
  role: UserRole;
}

const sectionOrder: IntakeStage[] = [
  "contact_info",
  "property_details",
  "ownership_disclosures",
  "access_showings",
  "media_condition",
  "pricing_goals",
  "review_submit",
  "complete",
];

const statusesAtOrBeyondSubmitted: IntakeStatus[] = [
  "submitted",
  "under_review",
  "blocked",
  "approved",
  "archived",
];

const adminOnlyCancelFrom: IntakeStatus[] = [
  "submitted",
  "under_review",
  "blocked",
  "approved",
];

const reviewerRoles = new Set(["agent", "coordinator", "admin"]);

export function allRequiredSectionsComplete(
  sections: Record<string, { status: string }>
): boolean {
  const preSubmitStages: SectionKey[] = [
    "contact_info",
    "property_details",
    "ownership_disclosures",
    "access_showings",
    "media_condition",
    "pricing_goals",
  ];

  for (const key of preSubmitStages) {
    if (sections[key]?.status !== "complete") {
      return false;
    }
  }

  return true;
}

export function noBlockingErrors(issues: ValidationIssue[]): boolean {
  return !issues.some((i) => i.blocking);
}

export function canTransitionStatus(
  current: IntakeStatus,
  next: IntakeStatus,
  context: TransitionContext
): boolean {
  if (current === next) return true;

  switch (current) {
    case "draft":
      return next === "invited" || next === "canceled";

    case "invited":
      return next === "in_progress" || next === "canceled";

    case "in_progress": {
      if (next === "submitted") {
        return allRequiredSectionsComplete(context.sections) && noBlockingErrors(context.issues);
      }
      return next === "canceled";
    }

    case "submitted":
      return next === "under_review" || next === "in_progress";

    case "under_review": {
      if (next === "approved") {
        return (
          context.readinessScore >= 60 &&
          context.requiredTasksComplete &&
          reviewerRoles.has(context.role)
        );
      }
      if (next === "blocked") {
        return reviewerRoles.has(context.role);
      }
      if (next === "in_progress") {
        return reviewerRoles.has(context.role);
      }
      return false;
    }

    case "blocked": {
      if (next === "under_review") return true;
      if (next === "in_progress") return reviewerRoles.has(context.role);
      if (next === "approved") {
        return (
          context.readinessScore >= 60 &&
          context.requiredTasksComplete &&
          reviewerRoles.has(context.role)
        );
      }
      return false;
    }

    case "approved":
      return next === "archived";

    case "archived":
      return false;

    case "canceled":
      return false;

    default:
      return false;
  }
}

export function getAllowedNextStatuses(
  current: IntakeStatus,
  context: TransitionContext
): IntakeStatus[] {
  const allStatuses: IntakeStatus[] = [
    "draft",
    "invited",
    "in_progress",
    "submitted",
    "under_review",
    "blocked",
    "approved",
    "archived",
    "canceled",
  ];

  const allowed: IntakeStatus[] = [];

  for (const status of allStatuses) {
    if (status === current) continue;

    if (canTransitionStatus(current, status, context)) {
      allowed.push(status);
    }
  }

  // Global cancel rule: any non-canceled -> canceled is admin only
  if (current !== "canceled" && !allowed.includes("canceled")) {
    if (context.role === "admin") {
      allowed.push("canceled");
    }
  }

  // Also enforce the global cancel rule for statuses where the switch
  // statement already allows it (draft, invited, in_progress) — those
  // are allowed for non-admins per the explicit rules.
  if (current !== "canceled" && adminOnlyCancelFrom.includes(current)) {
    if (context.role !== "admin" && allowed.includes("canceled")) {
      const idx = allowed.indexOf("canceled");
      if (idx !== -1) allowed.splice(idx, 1);
    }
  }

  return allowed;
}

export function advanceStage(
  currentStage: IntakeStage,
  sections: Record<string, { status: string }>,
  intakeStatus: IntakeStatus
): IntakeStage {
  let started = false;
  for (const stage of sectionOrder) {
    if (stage === "complete") {
      continue;
    }

    if (stage === currentStage) {
      started = true;
    }
    if (!started) {
      continue;
    }

    if (stage === "review_submit") {
      const isComplete =
        statusesAtOrBeyondSubmitted.includes(intakeStatus) ||
        sections[stage]?.status === "complete";
      if (!isComplete) {
        return stage;
      }
      continue;
    }

    if (sections[stage]?.status !== "complete") {
      return stage;
    }
  }

  return "complete";
}
