import type { InferSelectModel } from "drizzle-orm";
import * as schema from "~/db/schema.js";

export type PropertyRow = InferSelectModel<typeof schema.properties>;
export type ListingIntakeRow = InferSelectModel<typeof schema.listingIntakes>;
export type DocumentRow = InferSelectModel<typeof schema.documents>;
export type UserRow = InferSelectModel<typeof schema.users>;

export interface RESOMediaItem {
  ResourceName: string;
  MediaCategory: string;
  MediaType: string;
  MediaURL: string;
  Order: number;
  ShortDescription?: string;
}

export interface RESOPropertyPayload {
  "@reso.context": string;
  ListingKey?: string;
  UniversalPropertyIdentifier?: string;
  StreetNumber?: string;
  StreetName?: string;
  StreetDirPrefix?: string;
  StreetDirSuffix?: string;
  StreetAdditionalInfo?: string;
  City?: string;
  StateOrProvince?: string;
  PostalCode?: string;
  CountyOrParish?: string;
  Country?: string;
  ParcelNumber?: string;
  Latitude?: number;
  Longitude?: number;
  PropertyType?: string;
  PropertySubType?: string;
  OccupancyStatus?: string;
  YearBuilt?: number;
  LotSizeArea?: number;
  LotSizeUnits?: string;
  LivingArea?: number;
  LivingAreaUnits?: string;
  BedroomsTotal?: number;
  BathroomsTotalInteger?: number;
  ListPrice?: number;
  StandardStatus?: string;
  ListingContractDate?: string;
  ModificationTimestamp?: string;
  OriginatingSystemName?: string;
  OriginatingSystemKey?: string;
  SourceSystemName?: string;
  SourceSystemKey?: string;
  ListAgentKey?: string;
  PublicRemarks?: string;
  PrivateRemarks?: string;
  DaysOnMarket?: number;
  CumulativeDaysOnMarket?: number;
  Media?: RESOMediaItem[];
  // RESO allows local extensions
  [key: string]: unknown;
}

function toTitleCase(str: string): string {
  if (!str) return str;
  return str
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

function mapPropertyType(internal: string | null | undefined): string | undefined {
  const map: Record<string, string> = {
    residential: "Residential",
    land: "Land",
    commercial: "Commercial Sale",
    multifamily: "Multifamily",
  };
  return internal ? map[internal] || toTitleCase(internal) : undefined;
}

function snakeToTitle(str: string): string {
  return str
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

export function mapDocumentToRESOMedia(
  doc: DocumentRow,
  order: number,
  baseUrl: string
): RESOMediaItem {
  const parsed = doc.resoMediaJson;
  const category =
    parsed?.MediaCategory ||
    (doc.documentType === "photo"
      ? "Photo"
      : doc.documentType === "floorplan"
      ? "Floor Plan"
      : doc.documentType === "survey"
      ? "Document"
      : "Document");

  return {
    ResourceName: parsed?.ResourceName || "Property",
    MediaCategory: category,
    MediaType: parsed?.MediaType || doc.mimeType || "application/octet-stream",
    MediaURL: parsed?.MediaURL || `${baseUrl}/documents/${doc.id}`,
    Order: parsed?.Order ?? order,
    ShortDescription: parsed?.ShortDescription || snakeToTitle(doc.documentType),
  };
}

export function buildRESOPropertyPayload(
  property: PropertyRow,
  intake: ListingIntakeRow,
  documents: DocumentRow[],
  agent?: UserRow | null,
  opts?: { baseMediaUrl?: string; localExtensions?: Record<string, unknown> }
): RESOPropertyPayload {
  const baseMediaUrl = opts?.baseMediaUrl || "";
  const media = documents.map((d, idx) => mapDocumentToRESOMedia(d, idx + 1, baseMediaUrl));

  // Price is stored in integer cents; RESO expects dollars with decimals in some systems,
  // but RCF JSON is transport-agnostic. We export as dollars to match common Web API usage.
  const listPriceDollars =
    typeof intake.listPrice === "number" ? intake.listPrice / 100 : undefined;

  // Compute DOM/CDOM when listingContractDate is present
  let daysOnMarket: number | undefined;
  let cumulativeDaysOnMarket: number | undefined;
  if (intake.listingContractDate) {
    const start = new Date(intake.listingContractDate);
    const now = new Date();
    const diffMs = now.getTime() - start.getTime();
    daysOnMarket = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
    cumulativeDaysOnMarket = daysOnMarket;
  }

  const payload: RESOPropertyPayload = {
    "@reso.context": "urn:reso:metadata:2.0:resource:property",
    ListingKey: intake.id,
    UniversalPropertyIdentifier: property.universalPropertyIdentifier || undefined,
    StreetNumber: property.streetNumber || property.street1?.split(" ")[0] || undefined,
    StreetName:
      property.streetName ||
      property.street1?.split(" ").slice(1).join(" ") ||
      undefined,
    StreetDirPrefix: property.streetDirPrefix || undefined,
    StreetDirSuffix: property.streetDirSuffix || undefined,
    StreetAdditionalInfo:
      property.streetAdditionalInfo || property.street2 || undefined,
    City: property.city || undefined,
    StateOrProvince: property.stateOrProvince || property.state || undefined,
    PostalCode: property.postalCode || undefined,
    CountyOrParish: property.countyOrParish || property.county || undefined,
    Country: property.country || "US",
    ParcelNumber: property.parcelNumber || undefined,
    Latitude: property.latitude || undefined,
    Longitude: property.longitude || undefined,
    PropertyType: mapPropertyType(property.propertyType),
    PropertySubType: property.propertySubType || undefined,
    OccupancyStatus: property.occupancyStatus
      ? property.occupancyStatus
          .split("_")
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
          .join(" ")
      : undefined,
    YearBuilt: property.yearBuilt || undefined,
    LotSizeArea: property.lotSizeArea || undefined,
    LotSizeUnits: property.lotSizeUnits || "Square Feet",
    LivingArea: property.livingArea || undefined,
    LivingAreaUnits: property.livingAreaUnits || "Square Feet",
    BedroomsTotal: property.bedroomsTotal || undefined,
    BathroomsTotalInteger: property.bathroomsTotalInteger || undefined,
    ListPrice: listPriceDollars,
    StandardStatus: intake.standardStatus || undefined,
    ListingContractDate: intake.listingContractDate || undefined,
    ModificationTimestamp: intake.modificationTimestamp
      ? new Date(intake.modificationTimestamp).toISOString()
      : undefined,
    OriginatingSystemName: intake.originatingSystemName || "listing-intake-portal",
    OriginatingSystemKey: intake.originatingSystemKey || undefined,
    SourceSystemName: intake.originatingSystemName || "listing-intake-portal",
    SourceSystemKey: intake.originatingSystemKey || intake.id,
    ListAgentKey: agent?.id || intake.assignedAgentId || undefined,
    DaysOnMarket: daysOnMarket,
    CumulativeDaysOnMarket: cumulativeDaysOnMarket,
    Media: media.length > 0 ? media : undefined,
    ...opts?.localExtensions,
  };

  // Strip undefined values for cleaner JSON
  return Object.fromEntries(
    Object.entries(payload).filter(([, v]) => v !== undefined)
  ) as RESOPropertyPayload;
}

export function buildRESOValuePayload(
  properties: { property: PropertyRow; intake: ListingIntakeRow; documents: DocumentRow[]; agent?: UserRow | null }[],
  opts?: { baseMediaUrl?: string }
): { "@reso.context": string; value: RESOPropertyPayload[] } {
  return {
    "@reso.context": "urn:reso:metadata:2.0:resource:property",
    value: properties.map((p) =>
      buildRESOPropertyPayload(p.property, p.intake, p.documents, p.agent, opts)
    ),
  };
}
