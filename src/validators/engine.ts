import type { ValidationIssue, SectionKey } from "~/domains/types.js";
import { z } from "zod";
import {
  zPropertyDetailsSection,
  zAccessShowingsSection,
} from "~/schemas/index.js";
import type { SafeParseError } from "zod";

function zodIssuesToValidationIssues(result: SafeParseError<unknown>): ValidationIssue[] {
  return result.error.issues.map((issue) => ({
    severity: "error",
    code: `zod.${issue.path.join(".") || "root"}`,
    message: issue.message,
    blocking: true,
    fieldPath: issue.path.join("."),
  }));
}

export function validateSection(
  sectionKey: SectionKey,
  payload: Record<string, unknown>
): ValidationIssue[] {
  let schema: z.ZodType<Record<string, unknown>> | undefined;
  if (sectionKey === "property_details") schema = zPropertyDetailsSection;
  else if (sectionKey === "access_showings") schema = zAccessShowingsSection;

  const issues: ValidationIssue[] = [];
  if (schema) {
    const result = schema.safeParse(payload);
    if (!result.success) {
      issues.push(...zodIssuesToValidationIssues(result));
    }
  }

  if (sectionKey === "ownership_disclosures") {
    if (payload.hasHOA === true && !payload.hoaContactInfo) {
      issues.push({
        severity: "error",
        code: "section.hoa_contact_missing",
        message: "HOA contact info is required when HOA is true",
        blocking: true,
        fieldPath: "hoaContactInfo",
      });
    }
  }

  if (sectionKey === "media_condition") {
    if (payload.photosRequested === true && !payload.preferredPhotoDate) {
      issues.push({
        severity: "error",
        code: "section.photo_date_missing",
        message: "Preferred photo date is required when photos are requested",
        blocking: true,
        fieldPath: "preferredPhotoDate",
      });
    }
  }

  if (sectionKey === "pricing_goals") {
    const price = typeof payload.listPrice === "number" ? payload.listPrice : undefined;
    if (price !== undefined && price < 10_000_00) {
      issues.push({
        severity: "error",
        code: "section.price_too_low",
        message: "List price must be at least $10,000",
        blocking: true,
        fieldPath: "listPrice",
      });
    }
  }

  return issues;
}

export function validateIntakeBusinessRules(context: {
  sections: Record<string, { status: string; payload?: Record<string, unknown> }>;
  documents: { documentType: string }[];
  checklist: Record<string, string>;
  targetListDate?: string;
}): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const property = context.sections["property_details"]?.payload;
  const access = context.sections["access_showings"]?.payload;
  const disclosures = context.sections["ownership_disclosures"]?.payload;
  const media = context.sections["media_condition"]?.payload;
  const pricing = context.sections["pricing_goals"]?.payload;

  if (
    property?.occupancyStatus === "tenant_occupied" &&
    access && !access.showingNoticeHours
  ) {
    issues.push({
      severity: "error",
      code: "rule.tenant_notice_missing",
      message: "Showing notice hours are required for tenant-occupied properties",
      blocking: true,
    });
  }

  if (
    disclosures?.multipleOwners === true &&
    !context.documents.some((d) => d.documentType === "deed")
  ) {
    issues.push({
      severity: "warning",
      code: "rule.deed_suggested",
      message: "A deed document is suggested when there are multiple owners",
      blocking: false,
    });
  }

  if (context.targetListDate) {
    const target = new Date(context.targetListDate);
    const now = new Date();
    const diffDays = Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays < 0) {
      issues.push({
        severity: "error",
        code: "rule.past_list_date",
        message: "Target list date is in the past",
        blocking: true,
      });
    } else if (diffDays <= 3) {
      issues.push({
        severity: "warning",
        code: "rule.short_list_date",
        message: "Target list date is within 3 days",
        blocking: false,
      });
    }
  }

  if (
    context.sections["media_condition"]?.status === "complete" &&
    !context.documents.some((d) => d.documentType === "photo")
  ) {
    issues.push({
      severity: "error",
      code: "rule.photos_required_for_media_complete",
      message: "At least one photo document is required to mark media section complete",
      blocking: true,
    });
  }

  const price = typeof pricing?.listPrice === "number" ? pricing.listPrice : undefined;
  if (price !== undefined && price > 50_000_000_00) {
    issues.push({
      severity: "error",
      code: "rule.price_excessive",
      message: "List price exceeds $50,000,000",
      blocking: true,
      fieldPath: "listPrice",
    });
  }

  return issues;
}

export function runFullValidation(
  intakeId: string,
  deps: {
    sections: Record<string, { status: string; payload?: Record<string, unknown> }>;
    documents: { documentType: string }[];
    checklist: Record<string, string>;
    targetListDate?: string;
  }
): {
  intakeId: string;
  fieldIssues: ValidationIssue[];
  sectionIssues: ValidationIssue[];
  businessIssues: ValidationIssue[];
  allIssues: ValidationIssue[];
  blockingCount: number;
  warningCount: number;
} {
  const fieldIssues: ValidationIssue[] = [];
  const sectionIssues: ValidationIssue[] = [];
  for (const [key, sec] of Object.entries(deps.sections)) {
    if (!sec.payload) continue;
    const issues = validateSection(key as SectionKey, sec.payload);
    for (const issue of issues) {
      if (issue.fieldPath) {
        fieldIssues.push(issue);
      } else {
        sectionIssues.push(issue);
      }
    }
  }

  const businessIssues = validateIntakeBusinessRules(deps);
  const allIssues = [...fieldIssues, ...sectionIssues, ...businessIssues];
  const blockingCount = allIssues.filter((i) => i.blocking).length;
  const warningCount = allIssues.filter((i) => !i.blocking).length;

  return {
    intakeId,
    fieldIssues,
    sectionIssues,
    businessIssues,
    allIssues,
    blockingCount,
    warningCount,
  };
}
