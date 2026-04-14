export type IntakeStatus =
  | "draft"
  | "invited"
  | "in_progress"
  | "submitted"
  | "under_review"
  | "blocked"
  | "approved"
  | "archived"
  | "canceled";

export type IntakeStage =
  | "contact_info"
  | "property_details"
  | "ownership_disclosures"
  | "access_showings"
  | "media_condition"
  | "pricing_goals"
  | "review_submit"
  | "complete";

export type UserRole = "admin" | "agent" | "coordinator" | "seller";

export type ClientType = "individual" | "couple" | "trust" | "estate" | "llc";

export type PropertyType =
  | "Residential"
  | "Residential Lease"
  | "Land"
  | "Multifamily"
  | "Commercial Sale"
  | "Commercial Lease"
  | "Business Opportunity"
  | "Farm"
  | "Manufactured In Park"
  | "Specialty";

export type PropertySubType =
  | "Single Family Residence"
  | "Condominium"
  | "Townhouse"
  | "Duplex"
  | "Triplex"
  | "Quadruplex"
  | "Apartment"
  | "Manufactured Home"
  | "Cabin"
  | "Mobile Home"
  | "Ranch"
  | "Land"
  | "Commercial Building"
  | "Office"
  | "Retail"
  | "Warehouse"
  | "Mixed Use";

export type OccupancyStatus = "owner_occupied" | "tenant_occupied" | "vacant";

export type DocumentType =
  | "deed"
  | "survey"
  | "disclosure"
  | "utility_bill"
  | "hoa_doc"
  | "floorplan"
  | "photo"
  | "other";

export type TaskType =
  | "review_disclosure"
  | "schedule_photos"
  | "verify_parcel"
  | "pricing_review"
  | "call_seller"
  | "mls_entry_prep"
  | "showing_setup";

export type TaskStatus = "open" | "in_progress" | "blocked" | "complete" | "canceled";

export type MessageDirection = "inbound" | "outbound";

export type MessageChannel = "email" | "sms" | "portal";

export type ChecklistStatus = "pending" | "satisfied" | "waived" | "blocked";

export type ActorType = "seller" | "agent" | "system" | "coordinator";

export type SectionKey = IntakeStage;

export interface ListingIntake {
  id: string;
  orgId: string;
  propertyId: string;
  clientId: string;
  assignedAgentId?: string;
  assignedCoordinatorId?: string;
  status: IntakeStatus;
  currentStage: IntakeStage;
  completionPercent: number;
  readinessScore: number;
  targetListDate?: string;
  listPrice?: number;
  standardStatus?: string;
  listingContractDate?: string;
  modificationTimestamp?: string;
  originatingSystemName?: string;
  originatingSystemKey?: string;
  sellerMotivation?: string;
  source?: string;
  metadataJson?: string;
  submittedAt?: string;
  approvedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AccessShowingsSection {
  occupancyStatus: OccupancyStatus;
  lockboxAllowed: boolean;
  showingNoticeHours?: number;
  petsPresent?: boolean;
  gateCode?: string;
  alarmInstructions?: string;
  excludedShowingDays?: string[];
  bestContactMethod?: "sms" | "email" | "call";
}

export interface PropertyDetailsSection {
  propertyType: PropertyType;
  bedroomsTotal?: number;
  bathroomsTotalInteger?: number;
  yearBuilt?: number;
  occupancyStatus: OccupancyStatus;
  lotSizeArea?: number;
  livingArea?: number;
  lotSizeUnits?: string;
  livingAreaUnits?: string;
  propertySubType?: PropertySubType;
  streetNumber?: string;
  streetName?: string;
  streetDirPrefix?: string;
  streetDirSuffix?: string;
  streetAdditionalInfo?: string;
  stateOrProvince?: string;
  countyOrParish?: string;
  country?: string;
  universalPropertyIdentifier?: string;
  stories?: number;
}

export interface ValidationIssue {
  severity: "error" | "warning" | "info";
  code: string;
  message: string;
  blocking: boolean;
  fieldPath?: string;
  suggestedRemediation?: string;
}

export interface CommandContext {
  actorUserId?: string;
  actorType: ActorType;
  role: UserRole;
  timestamp: string;
}

export interface CompletionResult {
  percent: number;
  completedSections: SectionKey[];
  pendingSections: SectionKey[];
}

export interface ReadinessResult {
  score: number;
  grade: "A" | "B" | "C" | "D" | "F";
  blockers: ValidationIssue[];
  warnings: ValidationIssue[];
}

export interface FrictionResult {
  score: number;
  issues: ValidationIssue[];
  estimatedMinutesToResolve: number;
}
