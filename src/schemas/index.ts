import { z } from "zod";

export const zUUID = z.string().uuid();

export const zTimestampISO = z.string().datetime({ offset: true });

export const zMoneyCents = z.number().int().nonnegative();

export const zIntakeStatus = z.enum([
  "draft",
  "invited",
  "in_progress",
  "submitted",
  "under_review",
  "blocked",
  "approved",
  "archived",
  "canceled",
]);

export const zIntakeStage = z.enum([
  "contact_info",
  "property_details",
  "ownership_disclosures",
  "access_showings",
  "media_condition",
  "pricing_goals",
  "review_submit",
  "complete",
]);

export const zUserRole = z.enum(["admin", "agent", "coordinator", "seller"]);

export const zClientType = z.enum(["individual", "couple", "trust", "estate", "llc"]);

export const zPropertyType = z.enum([
  "Residential",
  "Residential Lease",
  "Land",
  "Multifamily",
  "Commercial Sale",
  "Commercial Lease",
  "Business Opportunity",
  "Farm",
  "Manufactured In Park",
  "Specialty",
]);

export const zPropertySubType = z.enum([
  "Single Family Residence",
  "Condominium",
  "Townhouse",
  "Duplex",
  "Triplex",
  "Quadruplex",
  "Apartment",
  "Manufactured Home",
  "Cabin",
  "Mobile Home",
  "Ranch",
  "Land",
  "Commercial Building",
  "Office",
  "Retail",
  "Warehouse",
  "Mixed Use",
]);

export const zOccupancyStatus = z.enum(["owner_occupied", "tenant_occupied", "vacant"]);

export const zDocumentType = z.enum([
  "deed",
  "survey",
  "disclosure",
  "utility_bill",
  "hoa_doc",
  "floorplan",
  "photo",
  "other",
]);

export const zTaskType = z.enum([
  "review_disclosure",
  "schedule_photos",
  "verify_parcel",
  "pricing_review",
  "call_seller",
  "mls_entry_prep",
  "showing_setup",
]);

export const zTaskStatus = z.enum(["open", "in_progress", "blocked", "complete", "canceled"]);

export const zMessageDirection = z.enum(["inbound", "outbound"]);

export const zMessageChannel = z.enum(["email", "sms", "portal"]);

export const zChecklistStatus = z.enum(["pending", "satisfied", "waived", "blocked"]);

export const zActorType = z.enum(["seller", "agent", "system", "coordinator"]);

export const zSectionKey = zIntakeStage;

export const zListingIntake = z.object({
  id: zUUID,
  orgId: zUUID,
  propertyId: zUUID,
  clientId: zUUID,
  assignedAgentId: zUUID.optional(),
  assignedCoordinatorId: zUUID.optional(),
  status: zIntakeStatus,
  currentStage: zIntakeStage,
  completionPercent: z.number().min(0).max(100),
  readinessScore: z.number().min(0).max(100),
  targetListDate: zTimestampISO.optional(),
  listPrice: zMoneyCents.optional(),
  standardStatus: z.string().optional(),
  listingContractDate: z.string().optional(),
  modificationTimestamp: zTimestampISO.optional(),
  originatingSystemName: z.string().optional(),
  originatingSystemKey: z.string().optional(),
  sellerMotivation: z.string().max(500).optional(),
  source: z.string().max(200).optional(),
  metadataJson: z.string().optional(),
  submittedAt: zTimestampISO.optional(),
  approvedAt: zTimestampISO.optional(),
  createdAt: zTimestampISO,
  updatedAt: zTimestampISO,
});

export const zAccessShowingsSection = z
  .object({
    occupancyStatus: zOccupancyStatus,
    lockboxAllowed: z.boolean(),
    showingNoticeHours: z.number().int().min(0).optional(),
    petsPresent: z.boolean().optional(),
    gateCode: z.string().max(100).optional(),
    alarmInstructions: z.string().max(500).optional(),
    excludedShowingDays: z.array(z.enum(["mon", "tue", "wed", "thu", "fri", "sat", "sun"])).optional(),
    bestContactMethod: z.enum(["sms", "email", "call"]).optional(),
  })
  .refine(
    (data) => {
      if (data.occupancyStatus === "tenant_occupied" && data.showingNoticeHours === undefined) {
        return false;
      }
      return true;
    },
    {
      message: "showingNoticeHours is required when occupancyStatus is tenant_occupied",
      path: ["showingNoticeHours"],
    }
  )
;

export const zPropertyDetailsSection = z
  .object({
    propertyType: zPropertyType,
    bedroomsTotal: z.number().int().nonnegative().optional(),
    bathroomsTotalInteger: z.number().int().nonnegative().optional(),
    yearBuilt: z.number().int().min(1600).optional(),
    occupancyStatus: zOccupancyStatus,
    lotSizeArea: z.number().int().positive().optional(),
    livingArea: z.number().int().positive().optional(),
    lotSizeUnits: z.string().optional(),
    livingAreaUnits: z.string().optional(),
    propertySubType: zPropertySubType.optional(),
    streetNumber: z.string().optional(),
    streetName: z.string().optional(),
    streetDirPrefix: z.string().optional(),
    streetDirSuffix: z.string().optional(),
    streetAdditionalInfo: z.string().optional(),
    stateOrProvince: z.string().optional(),
    countyOrParish: z.string().optional(),
    country: z.string().optional(),
    universalPropertyIdentifier: z.string().optional(),
    stories: z.number().int().positive().optional(),
  })
  .refine(
    (data) => {
      if (data.propertyType === "Residential") {
        return typeof data.bedroomsTotal === "number" && data.bedroomsTotal > 0 &&
               typeof data.bathroomsTotalInteger === "number" && data.bathroomsTotalInteger > 0;
      }
      return true;
    },
    {
      message: "bedroomsTotal and bathroomsTotalInteger are required when propertyType is Residential and must be greater than 0",
      path: ["bedroomsTotal"],
    }
  )
  .refine(
    (data) => {
      if (data.propertyType === "Land") {
        return data.lotSizeArea !== undefined;
      }
      return true;
    },
    {
      message: "lotSizeArea is required when propertyType is Land",
      path: ["lotSizeArea"],
    }
  )
  .refine(
    (data) => {
      if (typeof data.yearBuilt === "number") {
        return data.yearBuilt <= new Date().getFullYear();
      }
      return true;
    },
    {
      message: "yearBuilt cannot be in the future",
      path: ["yearBuilt"],
    }
  );

export const zValidationIssue = z.object({
  severity: z.enum(["error", "warning", "info"]),
  code: z.string().min(1).max(100),
  message: z.string().min(1).max(1000),
  blocking: z.boolean(),
  fieldPath: z.string().max(200).optional(),
  suggestedRemediation: z.string().max(1000).optional(),
});

export const zCommandContext = z.object({
  actorUserId: z.string().max(100).optional(),
  actorType: zActorType,
  role: zUserRole,
  timestamp: zTimestampISO,
});

export const zCompletionResult = z.object({
  percent: z.number().min(0).max(100),
  completedSections: z.array(zSectionKey),
  pendingSections: z.array(zSectionKey),
});

export const zReadinessResult = z.object({
  score: z.number().min(0).max(100),
  grade: z.enum(["A", "B", "C", "D", "F"]),
  blockers: z.array(zValidationIssue),
  warnings: z.array(zValidationIssue),
});

export const zFrictionResult = z.object({
  score: z.number().min(0).max(100),
  issues: z.array(zValidationIssue),
  estimatedMinutesToResolve: z.number().int().nonnegative(),
});

// Section schemas ------------------------------------------------------------------

export const zContactInfoSection = z.object({
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  email: z.string().email().max(254).optional(),
  phone: z.string().max(50).optional(),
  preferredContactMethod: z.enum(["sms", "email", "call"]).optional(),
  alternatePhone: z.string().max(50).optional(),
});

export const zOwnershipDisclosuresSection = z.object({
  isPrimaryResidence: z.boolean().optional(),
  hasHoa: z.boolean().optional(),
  hoaName: z.string().max(200).optional(),
  knownDefects: z.string().max(2000).optional(),
  recentRenovations: z.string().max(2000).optional(),
  hasLeadPaint: z.boolean().optional(),
  floodZone: z.string().max(100).optional(),
});

export const zMediaConditionSection = z.object({
  hasProfessionalPhotos: z.boolean().optional(),
  photoCount: z.number().int().min(0).max(500).optional(),
  virtualTourUrl: z.string().url().max(500).optional(),
  needsStaging: z.boolean().optional(),
  stagingNotes: z.string().max(1000).optional(),
});

export const zPricingGoalsSection = z.object({
  expectedPrice: z.number().int().nonnegative().optional(),
  minimumPrice: z.number().int().nonnegative().optional(),
  appraisalDisputes: z.string().max(1000).optional(),
  pricingStrategy: z.enum(["aggressive", "market", "conservative"]).optional(),
  urgency: z.enum(["low", "medium", "high"]).optional(),
});

export const zReviewSubmitSection = z.object({
  termsAccepted: z.boolean().optional(),
  accuracyConfirmed: z.boolean().optional(),
  signature: z.string().max(500).optional(),
  notes: z.string().max(2000).optional(),
});

export const zCompleteSection = z.object({
  completed: z.boolean().optional(),
  notes: z.string().max(1000).optional(),
});

// DO Command schemas ---------------------------------------------------------------

export const zCreateIntakeCommand = z.object({
  type: z.literal("CreateIntake"),
  propertyId: zUUID,
  clientId: zUUID,
  orgId: zUUID,
  assignedAgentId: zUUID.optional(),
  source: z.string().max(200).optional(),
  idempotencyKey: z.string().max(200).optional(),
  _meta: zCommandContext,
});

export const zInviteSellerCommand = z.object({
  type: z.literal("InviteSeller"),
  intakeId: z.string().min(1).max(100),
  sellerEmail: z.string().email().max(254),
  _meta: zCommandContext,
});

export const zUpdateSectionCommand = z.object({
  type: z.literal("UpdateSection"),
  intakeId: z.string().min(1).max(100),
  sectionKey: z.string().regex(/^[a-z_]+$/).max(50),
  payload: z.record(z.unknown()),
  _meta: zCommandContext,
});

export const zSubmitIntakeCommand = z.object({
  type: z.literal("SubmitIntake"),
  intakeId: z.string().min(1).max(100),
  _meta: zCommandContext,
});

export const zStartReviewCommand = z.object({
  type: z.literal("StartReview"),
  intakeId: z.string().min(1).max(100),
  _meta: zCommandContext,
});

export const zApproveIntakeCommand = z.object({
  type: z.literal("ApproveIntake"),
  intakeId: z.string().min(1).max(100),
  notes: z.string().max(2000).optional(),
  _meta: zCommandContext,
});

export const zBlockIntakeCommand = z.object({
  type: z.literal("BlockIntake"),
  intakeId: z.string().min(1).max(100),
  reason: z.string().min(1).max(2000),
  _meta: zCommandContext,
});

export const zRequestRevisionCommand = z.object({
  type: z.literal("RequestRevision"),
  intakeId: z.string().min(1).max(100),
  notes: z.string().min(1).max(2000),
  _meta: zCommandContext,
});

export const zUploadDocumentCommand = z.object({
  type: z.literal("UploadDocument"),
  intakeId: z.string().min(1).max(100),
  documentType: zDocumentType,
  fileName: z.string().min(1).max(255),
  storageKey: z.string().min(1).max(500),
  fileSizeBytes: z.number().int().min(0).max(100_000_000),
  checksumSha256: z.string().max(128).optional(),
  _meta: zCommandContext,
});

export const zAssignCoordinatorCommand = z.object({
  type: z.literal("AssignCoordinator"),
  intakeId: z.string().min(1).max(100),
  coordinatorId: z.string().min(1).max(100),
  _meta: zCommandContext,
});

export const zIntakeCommand = z.discriminatedUnion("type", [
  zCreateIntakeCommand,
  zInviteSellerCommand,
  zUpdateSectionCommand,
  zSubmitIntakeCommand,
  zStartReviewCommand,
  zApproveIntakeCommand,
  zBlockIntakeCommand,
  zRequestRevisionCommand,
  zUploadDocumentCommand,
  zAssignCoordinatorCommand,
]);
