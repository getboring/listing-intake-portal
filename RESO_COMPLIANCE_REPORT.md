# RESO / MLS Standards Compliance Report

## Executive Summary
This report compares the Listing Intake Portal against official **RESO (Real Estate Standards Organization)** standards and identifies gaps requiring remediation for MLS interoperability.

## Standards Referenced
- **RESO Data Dictionary 2.0** — ratified April 15, 2024
- **RESO Web API Core 2.0.0** — OData V4 / JSON transport
- **RESO Common Format (RCF)** — RCP-025, ratified November 2023
- **RESO Web API Add/Edit** — RCP-010, ratified January 2024
- **NAR MLS Policy Statement 7.90** — mandates RESO Web API & Data Dictionary compliance
- **EntityEvent / Webhooks** — RCP-027 / RCP-028 for push notifications

---

## Completed Remediations

### 1. Field Name Mapping (Data Dictionary 2.0)
RESO-aligned columns have been added to `properties` and `listing_intakes`:

| Our Field | RESO Standard Name | Status |
|-----------|-------------------|--------|
| `street_1` | `StreetNumber` + `StreetName` + `StreetAdditionalInfo` | ✅ Added `streetNumber`, `streetName`, `streetDirPrefix`, `streetDirSuffix`, `streetAdditionalInfo` |
| `state` | `StateOrProvince` | ✅ Added `stateOrProvince` column |
| `postal_code` | `PostalCode` | ✅ Existing |
| `county` | `CountyOrParish` | ✅ Added `countyOrParish` column |
| `parcel_number` | `ParcelNumber` | ✅ Existing |
| `bedrooms` | `BedroomsTotal` (Integer) | ✅ Added `bedroomsTotal` (integer) |
| `bathrooms` | `BathroomsTotalInteger` (Integer) | ✅ Added `bathroomsTotalInteger` (integer) |
| `lot_size_sqft` | `LotSizeArea` + `LotSizeUnits` | ✅ Added |
| `building_sqft` | `LivingArea` + `LivingAreaUnits` | ✅ Added |
| `desired_price` | `ListPrice` | ✅ Renamed to `listPrice` (cents) |
| `year_built` | `YearBuilt` | ✅ Existing |
| `property_type` | `PropertyType` | ✅ Mapped via `mapPropertyType()` |
| `property_sub_type` | `PropertySubType` | ✅ Added |
| `universal_property_identifier` | `UniversalPropertyIdentifier` (UPI v2.0) | ✅ Added |
| `standard_status` | `StandardStatus` | ✅ Added |
| `listing_contract_date` | `ListingContractDate` | ✅ Added |
| `modification_timestamp` | `ModificationTimestamp` | ✅ Added |
| `list_agent_key` | `ListAgentKey` | ✅ Mapped from `assignedAgent.id` |
| `originating_system_name` | `OriginatingSystemName` | ✅ Added |
| `originating_system_key` | `OriginatingSystemKey` | ✅ Added |

### 2. Media Resource Structure (RCF / Web API)
- ✅ Added `reso_media_json` column to `documents`.
- ✅ `mapDocumentToRESOMedia()` converts uploads to RESO `Media[]` array.
- ✅ All document types (photo, floorplan, survey, disclosure, etc.) are included in Media export.

### 3. RESO Common Format Export
- ✅ `src/export/reso.ts` generates RCF JSON with `@reso.context: urn:reso:metadata:2.0:resource:property`.
- ✅ Single-valued (`buildRESOPropertyPayload`) and multi-valued (`buildRESOValuePayload`) formats supported.
- ✅ `ListPrice` exported as dollars (converted from integer cents).

### 4. MLS Connector / Add-Edit Adapter
- ✅ `src/connectors/mls.ts` implements `MLSConnector` with `RESOWebAPIAdapter`.
- ✅ OAuth2 `client_credentials` flow with token caching.
- ✅ OData headers: `OData-Version: 4.01`, `Content-Type: application/json;odata.metadata=minimal`.
- ✅ `POST /Property`, `PATCH /Property('ID')`, `DELETE /Property('ID')`.
- ✅ 15-second request timeouts on all MLS outbound calls.

### 5. Address Structure
- ✅ RESO-aligned components stored separately (`StreetNumber`, `StreetName`, etc.).
- ✅ Fallback parsing from `street1` for backward compatibility.

### 6. Universal Property Identifier (UPI)
- ✅ `universalPropertyIdentifier` added to `properties` table and exposed in UI.

---

## Remaining Gaps

### Schema Coverage
The full RESO Data Dictionary 2.0 contains **1,700+ fields**. Current implementation covers the ~25 core MVP fields required for listing creation. Missing advanced structures:
- `Rooms[]`
- `UnitTypes[]`
- `ParkingFeatures[]`
- `GreenVerification[]`
- `PowerProduction[]`
- `Events[]`
- `Teams[]`
- Full `Member` / `Office` resource details

**Remediation:** Use `localExtensions` parameter in `buildRESOPropertyPayload()` to inject custom fields per-MLS.

### MLS Connector Enhancements
- ✅ `409 Conflict` and `412 Precondition Failed` are explicitly handled with sanitized error responses.
- ✅ 15-second timeouts (`AbortSignal.timeout`) are enforced on all outbound MLS calls.
- ⏳ Retry/backoff logic is not yet implemented.
- ⏳ Queue-based async push fallback is not yet implemented.

### Computed Fields
- ✅ `DaysOnMarket` and `CumulativeDaysOnMarket` are computed from `listingContractDate` (or `approvedAt` as fallback) in `buildRESOPropertyPayload()`.

### Webhooks
- `EntityEvent` push publisher (RCP-028) is not yet implemented.

---

## Recommendations Summary

### Immediate (Done)
1. ✅ Add RESO-aligned columns to `properties` and `listing_intakes`.
2. ✅ Update `PropertyType` enum and mapping to match RESO lookups.
3. ✅ Add `PropertySubType` field.
4. ✅ Change `bedrooms`/`bathrooms` to integer columns.
5. ✅ Build `src/export/reso.ts` — RCF payload generator.
6. ✅ Build `src/connectors/mls.ts` — `MLSConnector` + `RESOWebAPIAdapter`.

### Short-term (v2)
7. Implement retry/backoff for MLS pushes.
8. Add `StandardStatus` state machine aligned with RESO (`Active`, `Pending`, `Closed`, etc.).
9. Compute `DaysOnMarket` / `CumulativeDaysOnMarket`.
10. Add `EntityEvent` webhook publisher.

### Long-term (v3)
11. Expand schema coverage for `Rooms`, `ParkingFeatures`, etc.
12. Apply for RESO Common Format certification through `dev@reso.org`.

---

## References
- https://www.reso.org/data-dictionary/
- https://github.com/RESOStandards/transport/blob/main/proposals/reso-common-format.md
- https://www.reso.org/blog/entityevent-resource/
- https://www.nar.realtor/handbook-on-multiple-listing-policy/operational-issues-section-12-real-estate-transaction-standards-rets-policy-statement-790
