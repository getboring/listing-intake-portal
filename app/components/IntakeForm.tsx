import { useEffect, useState } from "react";

const API_BASE = import.meta.env.VITE_API_BASE || "";

type SectionKey =
  | "contact_info"
  | "property_details"
  | "ownership_disclosures"
  | "access_showings"
  | "media_condition"
  | "pricing_goals"
  | "review_submit";

interface IntakeState {
  status: string;
  currentStage: string;
  completionPercent: number;
  readinessScore: number;
  sections: Record<string, { status: string; payload?: Record<string, unknown> }>;
}

export function IntakeForm() {
  const intakeId = new URLSearchParams(window.location.search).get("id") || "";
  const [section, setSection] = useState<SectionKey>("property_details");
  const [statusMsg, setStatusMsg] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [intake, setIntake] = useState<IntakeState | null>(null);

  // Section payloads
  const [contactInfo, setContactInfo] = useState({
    sellerEmail: "",
    sellerPhone: "",
    alternatePhone: "",
    preferredContactTime: "anytime",
  });

  const [property, setProperty] = useState({
    propertyType: "Residential",
    propertySubType: "Single Family Residence",
    bedroomsTotal: "",
    bathroomsTotalInteger: "",
    yearBuilt: "",
    lotSizeArea: "",
    livingArea: "",
    universalPropertyIdentifier: "",
    occupancyStatus: "owner_occupied",
    streetNumber: "",
    streetName: "",
    city: "",
    stateOrProvince: "",
    postalCode: "",
    countyOrParish: "",
    country: "US",
  });

  const [ownership, setOwnership] = useState({
    hasHOA: false,
    hoaContactInfo: "",
    multipleOwners: false,
    primaryOwnerName: "",
  });

  const [access, setAccess] = useState({
    occupancyStatus: "owner_occupied",
    lockboxAllowed: false,
    showingNoticeHours: "",
    gateCode: "",
    alarmInstructions: "",
    bestContactMethod: "email",
    excludedShowingDays: [] as string[],
    petsPresent: false,
  });

  const [media, setMedia] = useState({
    photosRequested: false,
    preferredPhotoDate: "",
    videoTourRequested: false,
    floorplanRequested: false,
  });

  const [pricing, setPricing] = useState({
    listPrice: "",
    targetListDate: "",
    sellerMotivation: "",
    financingConsidered: false,
  });

  useEffect(() => {
    if (!intakeId) return;
    fetch(`${API_BASE}/intakes/${intakeId}`)
      .then((r) => r.json() as Promise<IntakeState>)
      .then((data) => {
        setIntake(data);
        // Hydrate form fields from existing sections if available
        if (data.sections) {
          if (data.sections.contact_info?.payload) {
            setContactInfo((s) => ({ ...s, ...(data.sections.contact_info.payload as typeof s) }));
          }
          if (data.sections.property_details?.payload) {
            setProperty((s) => ({ ...s, ...(data.sections.property_details.payload as typeof s) }));
          }
          if (data.sections.ownership_disclosures?.payload) {
            setOwnership((s) => ({ ...s, ...(data.sections.ownership_disclosures.payload as typeof s) }));
          }
          if (data.sections.access_showings?.payload) {
            setAccess((s) => ({ ...s, ...(data.sections.access_showings.payload as typeof s) }));
          }
          if (data.sections.media_condition?.payload) {
            setMedia((s) => ({ ...s, ...(data.sections.media_condition.payload as typeof s) }));
          }
          if (data.sections.pricing_goals?.payload) {
            setPricing((s) => ({ ...s, ...(data.sections.pricing_goals.payload as typeof s) }));
          }
        }
      })
      .catch(() => setStatusMsg("Failed to load intake"));
  }, [intakeId]);

  function coerceNumber(value: string): number | undefined {
    const n = value === "" ? NaN : Number(value);
    return Number.isFinite(n) ? n : undefined;
  }

  function buildPayload(): Record<string, unknown> {
    switch (section) {
      case "contact_info":
        return { ...contactInfo };
      case "property_details":
        return {
          ...property,
          bedroomsTotal: coerceNumber(property.bedroomsTotal),
          bathroomsTotalInteger: coerceNumber(property.bathroomsTotalInteger),
          yearBuilt: coerceNumber(property.yearBuilt),
          lotSizeArea: coerceNumber(property.lotSizeArea),
          livingArea: coerceNumber(property.livingArea),
        };
      case "ownership_disclosures":
        return { ...ownership };
      case "access_showings":
        return {
          ...access,
          showingNoticeHours: coerceNumber(access.showingNoticeHours),
        };
      case "media_condition":
        return { ...media };
      case "pricing_goals":
        return {
          ...pricing,
          listPrice: coerceNumber(pricing.listPrice),
        };
      case "review_submit":
        return { confirmed: true };
      default:
        return {};
    }
  }

  async function saveSection() {
    if (!intakeId) {
      setStatusMsg("Missing intake id in URL");
      return;
    }
    setLoading(true);
    const payload = buildPayload();
    const res = await fetch(`${API_BASE}/intakes/${intakeId}/sections/${section}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = (await res.json()) as { success?: boolean; errors?: string[] };
    setLoading(false);
    setStatusMsg(data.success ? "Saved successfully" : `Error: ${data.errors?.join(", ") || "Unknown"}`);
    // Refresh intake state
    if (data.success) {
      fetch(`${API_BASE}/intakes/${intakeId}`)
        .then((r) => r.json() as Promise<IntakeState>)
        .then(setIntake)
        .catch(() => {});
    }
  }

  async function submitIntake() {
    if (!intakeId) return;
    setLoading(true);
    const res = await fetch(`${API_BASE}/intakes/${intakeId}/submit`, { method: "POST" });
    const data = (await res.json()) as { success?: boolean; errors?: string[] };
    setLoading(false);
    setStatusMsg(data.success ? "Submitted" : `Error: ${data.errors?.join(", ") || "Unknown"}`);
    if (data.success) {
      fetch(`${API_BASE}/intakes/${intakeId}`)
        .then((r) => r.json() as Promise<IntakeState>)
        .then(setIntake)
        .catch(() => {});
    }
  }

  async function uploadDocument() {
    if (!intakeId) return;
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*,.pdf";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      setLoading(true);
      // 1) Get upload URL
      const urlRes = await fetch(
        `${API_BASE}/intakes/${intakeId}/documents/upload-url?documentType=photo&fileName=${encodeURIComponent(file.name)}`
      );
      const urlData = (await urlRes.json()) as { success?: boolean; data?: { storageKey: string; uploadUrl: string } };
      if (!urlData.success || !urlData.data) {
        setLoading(false);
        setStatusMsg("Failed to get upload URL");
        return;
      }
      // 2) Upload to R2 via direct-upload proxy
      const uploadRes = await fetch(`${API_BASE}${urlData.data.uploadUrl}`, {
        method: "PUT",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });
      if (!uploadRes.ok) {
        setLoading(false);
        setStatusMsg("Upload failed");
        return;
      }
      // 3) Register document in DO
      const registerRes = await fetch(`${API_BASE}/intakes/${intakeId}/documents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentType: "photo",
          fileName: file.name,
          storageKey: urlData.data.storageKey,
          fileSizeBytes: file.size,
        }),
      });
      const regData = (await registerRes.json()) as { success?: boolean; errors?: string[] };
      setLoading(false);
      setStatusMsg(regData.success ? "Document uploaded" : `Error: ${regData.errors?.join(", ") || "Unknown"}`);
    };
    input.click();
  }

  const sectionComplete = (key: SectionKey) => intake?.sections?.[key]?.status === "complete";

  return (
    <div style={{ maxWidth: 720, margin: "2rem auto", fontFamily: "system-ui, sans-serif", padding: "0 1rem" }}>
      <h1>Listing Intake</h1>
      <p style={{ color: "#666" }}>Intake ID: {intakeId || "missing"}</p>
      {intake && (
        <div style={{ marginBottom: 16, padding: 12, background: "#f5f5f5", borderRadius: 8 }}>
          <div>Status: <strong>{intake.status}</strong></div>
          <div>Stage: <strong>{intake.currentStage}</strong></div>
          <div>Completion: <strong>{intake.completionPercent}%</strong></div>
          <div>Readiness: <strong>{intake.readinessScore}</strong></div>
        </div>
      )}

      <div style={{ marginBottom: 16 }}>
        <label>Section: </label>
        <select value={section} onChange={(e) => setSection(e.target.value as SectionKey)}>
          <option value="contact_info">Contact Info</option>
          <option value="property_details">Property Details</option>
          <option value="ownership_disclosures">Ownership & Disclosures</option>
          <option value="access_showings">Access & Showings</option>
          <option value="media_condition">Media & Photos</option>
          <option value="pricing_goals">Pricing & Goals</option>
          <option value="review_submit">Review & Submit</option>
        </select>
        {sectionComplete(section) && <span style={{ color: "#080", marginLeft: 8 }}>✓ Complete</span>}
      </div>

      {section === "contact_info" && (
        <div style={{ display: "grid", gap: 12 }}>
          <label>Seller Email <input type="email" value={contactInfo.sellerEmail} onChange={(e) => setContactInfo({ ...contactInfo, sellerEmail: e.target.value })} /></label>
          <label>Seller Phone <input type="tel" value={contactInfo.sellerPhone} onChange={(e) => setContactInfo({ ...contactInfo, sellerPhone: e.target.value })} /></label>
          <label>Alternate Phone <input type="tel" value={contactInfo.alternatePhone} onChange={(e) => setContactInfo({ ...contactInfo, alternatePhone: e.target.value })} /></label>
          <label>Preferred Contact Time
            <select value={contactInfo.preferredContactTime} onChange={(e) => setContactInfo({ ...contactInfo, preferredContactTime: e.target.value })}>
              <option value="anytime">Anytime</option>
              <option value="morning">Morning</option>
              <option value="afternoon">Afternoon</option>
              <option value="evening">Evening</option>
            </select>
          </label>
        </div>
      )}

      {section === "property_details" && (
        <div style={{ display: "grid", gap: 12 }}>
          <label>Property Type
            <select value={property.propertyType} onChange={(e) => setProperty({ ...property, propertyType: e.target.value })}>
              <option value="Residential">Residential</option>
              <option value="Land">Land</option>
              <option value="Commercial Sale">Commercial Sale</option>
              <option value="Commercial Lease">Commercial Lease</option>
              <option value="Multifamily">Multifamily</option>
              <option value="Business Opportunity">Business Opportunity</option>
              <option value="Farm">Farm</option>
              <option value="Manufactured In Park">Manufactured In Park</option>
              <option value="Specialty">Specialty</option>
            </select>
          </label>
          <label>Property Subtype
            <select value={property.propertySubType} onChange={(e) => setProperty({ ...property, propertySubType: e.target.value })}>
              <option value="Single Family Residence">Single Family Residence</option>
              <option value="Condominium">Condominium</option>
              <option value="Townhouse">Townhouse</option>
              <option value="Duplex">Duplex</option>
              <option value="Triplex">Triplex</option>
              <option value="Quadruplex">Quadruplex</option>
              <option value="Apartment">Apartment</option>
              <option value="Manufactured Home">Manufactured Home</option>
              <option value="Cabin">Cabin</option>
              <option value="Mobile Home">Mobile Home</option>
              <option value="Ranch">Ranch</option>
              <option value="Land">Land</option>
              <option value="Commercial Building">Commercial Building</option>
              <option value="Office">Office</option>
              <option value="Retail">Retail</option>
              <option value="Warehouse">Warehouse</option>
              <option value="Mixed Use">Mixed Use</option>
            </select>
          </label>
          {property.propertyType === "Residential" && (
            <>
              <label>Bedrooms Total <input type="number" min={0} value={property.bedroomsTotal} onChange={(e) => setProperty({ ...property, bedroomsTotal: e.target.value })} /></label>
              <label>Bathrooms Total <input type="number" min={0} value={property.bathroomsTotalInteger} onChange={(e) => setProperty({ ...property, bathroomsTotalInteger: e.target.value })} /></label>
            </>
          )}
          <label>Year Built <input type="number" min={1600} value={property.yearBuilt} onChange={(e) => setProperty({ ...property, yearBuilt: e.target.value })} /></label>
          <label>Lot Size Area <input type="number" min={0} value={property.lotSizeArea} onChange={(e) => setProperty({ ...property, lotSizeArea: e.target.value })} /></label>
          <label>Living Area <input type="number" min={0} value={property.livingArea} onChange={(e) => setProperty({ ...property, livingArea: e.target.value })} /></label>
          <label>Universal Property ID (UPI) <input type="text" value={property.universalPropertyIdentifier} onChange={(e) => setProperty({ ...property, universalPropertyIdentifier: e.target.value })} /></label>
          <label>Street Number <input type="text" value={property.streetNumber} onChange={(e) => setProperty({ ...property, streetNumber: e.target.value })} /></label>
          <label>Street Name <input type="text" value={property.streetName} onChange={(e) => setProperty({ ...property, streetName: e.target.value })} /></label>
          <label>City <input type="text" value={property.city} onChange={(e) => setProperty({ ...property, city: e.target.value })} /></label>
          <label>State/Province <input type="text" value={property.stateOrProvince} onChange={(e) => setProperty({ ...property, stateOrProvince: e.target.value })} /></label>
          <label>Postal Code <input type="text" value={property.postalCode} onChange={(e) => setProperty({ ...property, postalCode: e.target.value })} /></label>
          <label>County/Parish <input type="text" value={property.countyOrParish} onChange={(e) => setProperty({ ...property, countyOrParish: e.target.value })} /></label>
          <label>Occupancy Status
            <select value={property.occupancyStatus} onChange={(e) => setProperty({ ...property, occupancyStatus: e.target.value })}>
              <option value="owner_occupied">Owner Occupied</option>
              <option value="tenant_occupied">Tenant Occupied</option>
              <option value="vacant">Vacant</option>
            </select>
          </label>
        </div>
      )}

      {section === "ownership_disclosures" && (
        <div style={{ display: "grid", gap: 12 }}>
          <label><input type="checkbox" checked={ownership.hasHOA} onChange={(e) => setOwnership({ ...ownership, hasHOA: e.target.checked })} /> Has HOA</label>
          {ownership.hasHOA && (
            <label>HOA Contact Info <input type="text" value={ownership.hoaContactInfo} onChange={(e) => setOwnership({ ...ownership, hoaContactInfo: e.target.value })} /></label>
          )}
          <label><input type="checkbox" checked={ownership.multipleOwners} onChange={(e) => setOwnership({ ...ownership, multipleOwners: e.target.checked })} /> Multiple Owners</label>
          <label>Primary Owner Name <input type="text" value={ownership.primaryOwnerName} onChange={(e) => setOwnership({ ...ownership, primaryOwnerName: e.target.value })} /></label>
        </div>
      )}

      {section === "access_showings" && (
        <div style={{ display: "grid", gap: 12 }}>
          <label>Occupancy Status
            <select value={access.occupancyStatus} onChange={(e) => setAccess({ ...access, occupancyStatus: e.target.value })}>
              <option value="owner_occupied">Owner Occupied</option>
              <option value="tenant_occupied">Tenant Occupied</option>
              <option value="vacant">Vacant</option>
            </select>
          </label>
          <label><input type="checkbox" checked={access.lockboxAllowed} onChange={(e) => setAccess({ ...access, lockboxAllowed: e.target.checked })} /> Lockbox Allowed</label>
          {access.occupancyStatus === "tenant_occupied" && (
            <label>Showing Notice Hours <input type="number" min={0} value={access.showingNoticeHours} onChange={(e) => setAccess({ ...access, showingNoticeHours: e.target.value })} /></label>
          )}
          <label>Gate Code <input type="text" value={access.gateCode} onChange={(e) => setAccess({ ...access, gateCode: e.target.value })} /></label>
          <label>Alarm Instructions <input type="text" value={access.alarmInstructions} onChange={(e) => setAccess({ ...access, alarmInstructions: e.target.value })} /></label>
          <label>Best Contact Method
            <select value={access.bestContactMethod} onChange={(e) => setAccess({ ...access, bestContactMethod: e.target.value })}>
              <option value="email">Email</option>
              <option value="sms">SMS</option>
              <option value="call">Call</option>
            </select>
          </label>
          <label><input type="checkbox" checked={access.petsPresent} onChange={(e) => setAccess({ ...access, petsPresent: e.target.checked })} /> Pets Present</label>
        </div>
      )}

      {section === "media_condition" && (
        <div style={{ display: "grid", gap: 12 }}>
          <label><input type="checkbox" checked={media.photosRequested} onChange={(e) => setMedia({ ...media, photosRequested: e.target.checked })} /> Photos Requested</label>
          {media.photosRequested && (
            <label>Preferred Photo Date <input type="date" value={media.preferredPhotoDate} onChange={(e) => setMedia({ ...media, preferredPhotoDate: e.target.value })} /></label>
          )}
          <label><input type="checkbox" checked={media.videoTourRequested} onChange={(e) => setMedia({ ...media, videoTourRequested: e.target.checked })} /> Video Tour Requested</label>
          <label><input type="checkbox" checked={media.floorplanRequested} onChange={(e) => setMedia({ ...media, floorplanRequested: e.target.checked })} /> Floorplan Requested</label>
          <button type="button" onClick={uploadDocument} disabled={loading}>Upload Photo</button>
        </div>
      )}

      {section === "pricing_goals" && (
        <div style={{ display: "grid", gap: 12 }}>
          <label>List Price ($) <input type="number" min={0} value={pricing.listPrice} onChange={(e) => setPricing({ ...pricing, listPrice: e.target.value })} /></label>
          <label>Target List Date <input type="date" value={pricing.targetListDate} onChange={(e) => setPricing({ ...pricing, targetListDate: e.target.value })} /></label>
          <label>Seller Motivation <input type="text" value={pricing.sellerMotivation} onChange={(e) => setPricing({ ...pricing, sellerMotivation: e.target.value })} /></label>
          <label><input type="checkbox" checked={pricing.financingConsidered} onChange={(e) => setPricing({ ...pricing, financingConsidered: e.target.checked })} /> Financing Considered</label>
        </div>
      )}

      {section === "review_submit" && (
        <div style={{ padding: 16, background: "#f0f8ff", borderRadius: 8 }}>
          <h3>Review your information</h3>
          <p>Please confirm that all sections are complete before submitting.</p>
          <ul>
            {(["contact_info", "property_details", "ownership_disclosures", "access_showings", "media_condition", "pricing_goals"] as SectionKey[]).map((k) => (
              <li key={k} style={{ color: sectionComplete(k) ? "#080" : "#c00" }}>
                {k.replace(/_/g, " ")}: {sectionComplete(k) ? "Complete" : "Incomplete"}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div style={{ marginTop: 24, display: "flex", gap: 12, flexWrap: "wrap" }}>
        <button type="button" onClick={saveSection} disabled={loading}>Save Section</button>
        <button type="button" onClick={submitIntake} disabled={loading}>Submit Intake</button>
      </div>

      {statusMsg && <p style={{ marginTop: 16, color: statusMsg.startsWith("Error") ? "#c00" : "#080" }}>{statusMsg}</p>}
    </div>
  );
}
