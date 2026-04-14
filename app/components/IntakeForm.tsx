import { useEffect, useMemo, useState } from "react";
import {
  Check,
  ChevronRight,
  Home,
  Image,
  Mail,
  MapPin,
  Shield,
  Upload,
  DollarSign,
  FileCheck,
  AlertCircle,
} from "lucide-react";
import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Select } from "./ui/select";
import { Badge } from "./ui/badge";
import { Progress } from "./ui/progress";
import { Alert, AlertDescription, AlertTitle } from "./ui/alert";
import { Checkbox } from "./ui/checkbox";
import { Separator } from "./ui/separator";
import { Skeleton } from "./ui/skeleton";

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

const SECTIONS: { key: SectionKey; label: string; icon: React.ElementType }[] = [
  { key: "contact_info", label: "Contact", icon: Mail },
  { key: "property_details", label: "Property", icon: MapPin },
  { key: "ownership_disclosures", label: "Ownership", icon: Shield },
  { key: "access_showings", label: "Access", icon: Home },
  { key: "media_condition", label: "Media", icon: Image },
  { key: "pricing_goals", label: "Pricing", icon: DollarSign },
  { key: "review_submit", label: "Review", icon: FileCheck },
];

export function IntakeForm() {
  const intakeId = useMemo(() => new URLSearchParams(window.location.search).get("id") || "", []);
  const [section, setSection] = useState<SectionKey>("contact_info");
  const [statusMsg, setStatusMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [intake, setIntake] = useState<IntakeState | null>(null);
  const [uploading, setUploading] = useState(false);

  // Section payloads (aligned with Zod schemas)
  const [contactInfo, setContactInfo] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    alternatePhone: "",
    preferredContactMethod: "anytime",
  });

  const [property, setProperty] = useState({
    propertyType: "Residential",
    propertySubType: "Single Family Residence",
    bedroomsTotal: "",
    bathroomsTotalInteger: "",
    yearBuilt: "",
    lotSizeArea: "",
    lotSizeUnits: "Square Feet",
    livingArea: "",
    livingAreaUnits: "Square Feet",
    universalPropertyIdentifier: "",
    occupancyStatus: "owner_occupied",
    streetNumber: "",
    streetName: "",
    streetDirPrefix: "",
    streetDirSuffix: "",
    streetAdditionalInfo: "",
    city: "",
    stateOrProvince: "",
    postalCode: "",
    countyOrParish: "",
    country: "US",
    stories: "",
  });

  const [ownership, setOwnership] = useState({
    isPrimaryResidence: false,
    hasHoa: false,
    hoaName: "",
    multipleOwners: false,
    primaryOwnerName: "",
    knownDefects: "",
    recentRenovations: "",
    hasLeadPaint: false,
    floodZone: "",
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
    hasProfessionalPhotos: false,
    photoCount: "",
    virtualTourUrl: "",
    videoTourRequested: false,
    needsStaging: false,
    stagingNotes: "",
    floorplanRequested: false,
    preferredPhotoDate: "",
  });

  const [pricing, setPricing] = useState({
    expectedPrice: "",
    minimumPrice: "",
    targetListDate: "",
    sellerMotivation: "",
    appraisalDisputes: "",
    pricingStrategy: "market",
    urgency: "medium",
    financingConsidered: false,
  });

  const [review, setReview] = useState({
    termsAccepted: false,
    accuracyConfirmed: false,
    signature: "",
    notes: "",
  });

  useEffect(() => {
    if (!intakeId) return;
    fetch(`${API_BASE}/intakes/${intakeId}`)
      .then((r) => r.json() as Promise<IntakeState>)
      .then((data) => {
        setIntake(data);
        if (data.sections) {
          const ci = data.sections.contact_info?.payload;
          if (ci) {
            setContactInfo({
              firstName: String(ci.firstName || ""),
              lastName: String(ci.lastName || ""),
              email: String(ci.email || ci.sellerEmail || ""),
              phone: String(ci.phone || ci.sellerPhone || ""),
              alternatePhone: String(ci.alternatePhone || ""),
              preferredContactMethod: String(ci.preferredContactMethod || "anytime"),
            });
          }
          const pd = data.sections.property_details?.payload;
          if (pd) {
            setProperty({
              propertyType: String(pd.propertyType || "Residential"),
              propertySubType: String(pd.propertySubType || "Single Family Residence"),
              bedroomsTotal: pd.bedroomsTotal !== undefined ? String(pd.bedroomsTotal) : "",
              bathroomsTotalInteger: pd.bathroomsTotalInteger !== undefined ? String(pd.bathroomsTotalInteger) : "",
              yearBuilt: pd.yearBuilt !== undefined ? String(pd.yearBuilt) : "",
              lotSizeArea: pd.lotSizeArea !== undefined ? String(pd.lotSizeArea) : "",
              lotSizeUnits: String(pd.lotSizeUnits || "Square Feet"),
              livingArea: pd.livingArea !== undefined ? String(pd.livingArea) : "",
              livingAreaUnits: String(pd.livingAreaUnits || "Square Feet"),
              universalPropertyIdentifier: String(pd.universalPropertyIdentifier || ""),
              occupancyStatus: String(pd.occupancyStatus || "owner_occupied"),
              streetNumber: String(pd.streetNumber || ""),
              streetName: String(pd.streetName || ""),
              streetDirPrefix: String(pd.streetDirPrefix || ""),
              streetDirSuffix: String(pd.streetDirSuffix || ""),
              streetAdditionalInfo: String(pd.streetAdditionalInfo || ""),
              city: String(pd.city || ""),
              stateOrProvince: String(pd.stateOrProvince || ""),
              postalCode: String(pd.postalCode || ""),
              countyOrParish: String(pd.countyOrParish || ""),
              country: String(pd.country || "US"),
              stories: pd.stories !== undefined ? String(pd.stories) : "",
            });
          }
          const od = data.sections.ownership_disclosures?.payload;
          if (od) {
            setOwnership({
              isPrimaryResidence: Boolean(od.isPrimaryResidence),
              hasHoa: Boolean(od.hasHoa),
              hoaName: String(od.hoaName || od.hoaContactInfo || ""),
              multipleOwners: Boolean(od.multipleOwners),
              primaryOwnerName: String(od.primaryOwnerName || ""),
              knownDefects: String(od.knownDefects || ""),
              recentRenovations: String(od.recentRenovations || ""),
              hasLeadPaint: Boolean(od.hasLeadPaint),
              floodZone: String(od.floodZone || ""),
            });
          }
          const ash = data.sections.access_showings?.payload;
          if (ash) {
            setAccess({
              occupancyStatus: String(ash.occupancyStatus || "owner_occupied"),
              lockboxAllowed: Boolean(ash.lockboxAllowed),
              showingNoticeHours: ash.showingNoticeHours !== undefined ? String(ash.showingNoticeHours) : "",
              gateCode: String(ash.gateCode || ""),
              alarmInstructions: String(ash.alarmInstructions || ""),
              bestContactMethod: String(ash.bestContactMethod || "email"),
              excludedShowingDays: Array.isArray(ash.excludedShowingDays) ? ash.excludedShowingDays.map(String) : [],
              petsPresent: Boolean(ash.petsPresent),
            });
          }
          const mc = data.sections.media_condition?.payload;
          if (mc) {
            setMedia({
              hasProfessionalPhotos: Boolean(mc.hasProfessionalPhotos ?? mc.photosRequested),
              photoCount: mc.photoCount !== undefined ? String(mc.photoCount) : "",
              virtualTourUrl: String(mc.virtualTourUrl || ""),
              videoTourRequested: Boolean(mc.videoTourRequested),
              needsStaging: Boolean(mc.needsStaging),
              stagingNotes: String(mc.stagingNotes || ""),
              floorplanRequested: Boolean(mc.floorplanRequested),
              preferredPhotoDate: String(mc.preferredPhotoDate || ""),
            });
          }
          const pg = data.sections.pricing_goals?.payload;
          if (pg) {
            setPricing({
              expectedPrice: pg.expectedPrice !== undefined ? String(pg.expectedPrice) : pg.listPrice !== undefined ? String(pg.listPrice) : "",
              minimumPrice: pg.minimumPrice !== undefined ? String(pg.minimumPrice) : "",
              targetListDate: String(pg.targetListDate || ""),
              sellerMotivation: String(pg.sellerMotivation || ""),
              appraisalDisputes: String(pg.appraisalDisputes || ""),
              pricingStrategy: String(pg.pricingStrategy || "market"),
              urgency: String(pg.urgency || "medium"),
              financingConsidered: Boolean(pg.financingConsidered),
            });
          }
          const rs = data.sections.review_submit?.payload;
          if (rs) {
            setReview({
              termsAccepted: Boolean(rs.termsAccepted),
              accuracyConfirmed: Boolean(rs.accuracyConfirmed),
              signature: String(rs.signature || ""),
              notes: String(rs.notes || ""),
            });
          }
        }
      })
      .catch(() => setStatusMsg({ type: "error", text: "Failed to load intake" }));
  }, [intakeId]);

  function coerceNumber(value: string): number | undefined {
    const n = value === "" ? NaN : Number(value);
    return Number.isFinite(n) ? n : undefined;
  }

  function toggleDay(day: string) {
    setAccess((prev) => {
      const exists = prev.excludedShowingDays.includes(day);
      return {
        ...prev,
        excludedShowingDays: exists ? prev.excludedShowingDays.filter((d) => d !== day) : [...prev.excludedShowingDays, day],
      };
    });
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
          stories: coerceNumber(property.stories),
        };
      case "ownership_disclosures":
        return { ...ownership };
      case "access_showings":
        return {
          ...access,
          showingNoticeHours: coerceNumber(access.showingNoticeHours),
        };
      case "media_condition":
        return {
          ...media,
          photoCount: coerceNumber(media.photoCount),
        };
      case "pricing_goals":
        return {
          ...pricing,
          expectedPrice: coerceNumber(pricing.expectedPrice),
          minimumPrice: coerceNumber(pricing.minimumPrice),
        };
      case "review_submit":
        return { ...review };
      default:
        return {};
    }
  }

  async function saveSection() {
    if (!intakeId) {
      setStatusMsg({ type: "error", text: "Missing intake id in URL" });
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
    if (data.success) {
      setStatusMsg({ type: "success", text: "Saved successfully" });
      fetch(`${API_BASE}/intakes/${intakeId}`)
        .then((r) => r.json() as Promise<IntakeState>)
        .then(setIntake)
        .catch(() => {});
    } else {
      setStatusMsg({ type: "error", text: data.errors?.join(", ") || "Unknown error" });
    }
  }

  async function submitIntake() {
    if (!intakeId) return;
    if (!review.termsAccepted || !review.accuracyConfirmed) {
      setStatusMsg({ type: "error", text: "Please accept the terms and confirm accuracy before submitting." });
      return;
    }
    setLoading(true);
    const res = await fetch(`${API_BASE}/intakes/${intakeId}/submit`, { method: "POST" });
    const data = (await res.json()) as { success?: boolean; errors?: string[] };
    setLoading(false);
    if (data.success) {
      setStatusMsg({ type: "success", text: "Submitted successfully" });
      fetch(`${API_BASE}/intakes/${intakeId}`)
        .then((r) => r.json() as Promise<IntakeState>)
        .then(setIntake)
        .catch(() => {});
    } else {
      setStatusMsg({ type: "error", text: data.errors?.join(", ") || "Unknown error" });
    }
  }

  async function uploadDocument() {
    if (!intakeId) return;
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*,application/pdf";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      setUploading(true);
      const urlRes = await fetch(
        `${API_BASE}/intakes/${intakeId}/documents/upload-url?documentType=photo&fileName=${encodeURIComponent(file.name)}`
      );
      const urlData = (await urlRes.json()) as { success?: boolean; data?: { storageKey: string; uploadUrl: string } };
      if (!urlData.success || !urlData.data) {
        setUploading(false);
        setStatusMsg({ type: "error", text: "Failed to get upload URL" });
        return;
      }
      const uploadRes = await fetch(`${API_BASE}${urlData.data.uploadUrl}`, {
        method: "PUT",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });
      if (!uploadRes.ok) {
        setUploading(false);
        setStatusMsg({ type: "error", text: "Upload failed" });
        return;
      }
      const registerRes = await fetch(`${API_BASE}/intakes/${intakeId}/documents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentType: "photo",
          fileName: file.name,
          storageKey: urlData.data.storageKey,
          fileSizeBytes: file.size,
          mimeType: file.type,
        }),
      });
      const regData = (await registerRes.json()) as { success?: boolean; errors?: string[] };
      setUploading(false);
      if (regData.success) {
        setStatusMsg({ type: "success", text: "Document uploaded" });
      } else {
        setStatusMsg({ type: "error", text: regData.errors?.join(", ") || "Unknown error" });
      }
    };
    input.click();
  }

  const sectionComplete = (key: SectionKey) => intake?.sections?.[key]?.status === "complete";
  const activeIndex = SECTIONS.findIndex((s) => s.key === section);

  const Stepper = () => (
    <div className="mb-8">
      <div className="flex items-center justify-between overflow-x-auto pb-2">
        {SECTIONS.map((s) => {
          const Icon = s.icon;
          const complete = sectionComplete(s.key);
          const active = s.key === section;
          return (
            <button
              key={s.key}
              onClick={() => setSection(s.key)}
              className={cn(
                "group flex min-w-[5rem] flex-col items-center gap-2 rounded-lg px-2 py-3 transition-colors",
                active ? "bg-primary/10" : "hover:bg-muted"
              )}
            >
              <div
                className={cn(
                  "flex h-10 w-10 items-center justify-center rounded-full border-2 transition-all",
                  complete
                    ? "border-primary bg-primary text-primary-foreground"
                    : active
                    ? "border-primary text-primary"
                    : "border-muted-foreground/30 text-muted-foreground"
                )}
              >
                {complete ? <Check className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
              </div>
              <span className={cn("text-xs font-medium", active ? "text-primary" : "text-muted-foreground")}>{s.label}</span>
            </button>
          );
        })}
      </div>
      <Progress value={intake?.completionPercent ?? 0} className="h-2" />
      <div className="mt-2 flex justify-between text-xs text-muted-foreground">
        <span>Progress</span>
        <span>{intake?.completionPercent ?? 0}% complete</span>
      </div>
    </div>
  );

  if (!intakeId) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Welcome</CardTitle>
            <CardDescription>Please provide an intake ID in the URL to get started.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (!intake) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <Skeleton className="mb-6 h-8 w-1/3" />
        <Skeleton className="mb-4 h-24 w-full" />
        <Skeleton className="mb-4 h-48 w-full" />
        <Skeleton className="h-10 w-32" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-50 to-indigo-50 p-4 pb-24 sm:p-6">
      <div className="mx-auto max-w-3xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">Listing Intake</h1>
            <p className="text-sm text-muted-foreground">Complete the steps below to list your property.</p>
          </div>
          <div className="text-right">
            <Badge variant={intake.status === "approved" ? "default" : "secondary"}>{intake.status}</Badge>
            <div className="mt-1 text-xs text-muted-foreground">ID: {intakeId.slice(0, 8)}</div>
          </div>
        </div>

        <Stepper />

        {statusMsg && (
          <Alert variant={statusMsg.type === "error" ? "destructive" : "default"} className="mb-6">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>{statusMsg.type === "error" ? "Oops" : "Success"}</AlertTitle>
            <AlertDescription>{statusMsg.text}</AlertDescription>
          </Alert>
        )}

        <Card className="border-0 shadow-xl shadow-black/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {(() => {
                const Icon = SECTIONS[activeIndex].icon;
                return <Icon className="h-5 w-5 text-primary" />;
              })()}
              {SECTIONS[activeIndex].label}
            </CardTitle>
            <CardDescription>
              {section === "contact_info" && "How can we reach you?"}
              {section === "property_details" && "Tell us about the property."}
              {section === "ownership_disclosures" && "Ownership details and disclosures."}
              {section === "access_showings" && "How should buyers access the property?"}
              {section === "media_condition" && "Photos, video tours, and floorplans."}
              {section === "pricing_goals" && "Pricing expectations and timeline."}
              {section === "review_submit" && "Review everything before submitting."}
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-6">
            {section === "contact_info" && (
              <div className="grid gap-5 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>First Name</Label>
                  <Input value={contactInfo.firstName} onChange={(e) => setContactInfo({ ...contactInfo, firstName: e.target.value })} placeholder="Jane" />
                </div>
                <div className="space-y-2">
                  <Label>Last Name</Label>
                  <Input value={contactInfo.lastName} onChange={(e) => setContactInfo({ ...contactInfo, lastName: e.target.value })} placeholder="Doe" />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label>Email</Label>
                  <Input type="email" value={contactInfo.email} onChange={(e) => setContactInfo({ ...contactInfo, email: e.target.value })} placeholder="you@example.com" />
                </div>
                <div className="space-y-2">
                  <Label>Phone</Label>
                  <Input type="tel" value={contactInfo.phone} onChange={(e) => setContactInfo({ ...contactInfo, phone: e.target.value })} placeholder="(555) 123-4567" />
                </div>
                <div className="space-y-2">
                  <Label>Alternate Phone</Label>
                  <Input type="tel" value={contactInfo.alternatePhone} onChange={(e) => setContactInfo({ ...contactInfo, alternatePhone: e.target.value })} placeholder="Optional" />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label>Preferred Contact Method</Label>
                  <Select value={contactInfo.preferredContactMethod} onChange={(e) => setContactInfo({ ...contactInfo, preferredContactMethod: e.target.value })}>
                    <option value="anytime">Anytime</option>
                    <option value="morning">Morning</option>
                    <option value="afternoon">Afternoon</option>
                    <option value="evening">Evening</option>
                  </Select>
                </div>
              </div>
            )}

            {section === "property_details" && (
              <div className="space-y-6">
                <div className="grid gap-5 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Property Type</Label>
                    <Select value={property.propertyType} onChange={(e) => setProperty({ ...property, propertyType: e.target.value })}>
                      <option value="Residential">Residential</option>
                      <option value="Residential Lease">Residential Lease</option>
                      <option value="Land">Land</option>
                      <option value="Multifamily">Multifamily</option>
                      <option value="Commercial Sale">Commercial Sale</option>
                      <option value="Commercial Lease">Commercial Lease</option>
                      <option value="Business Opportunity">Business Opportunity</option>
                      <option value="Farm">Farm</option>
                      <option value="Manufactured In Park">Manufactured In Park</option>
                      <option value="Specialty">Specialty</option>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Property Subtype</Label>
                    <Select value={property.propertySubType} onChange={(e) => setProperty({ ...property, propertySubType: e.target.value })}>
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
                    </Select>
                  </div>
                  {property.propertyType === "Residential" && (
                    <>
                      <div className="space-y-2">
                        <Label>Bedrooms Total</Label>
                        <Input type="number" min={1} value={property.bedroomsTotal} onChange={(e) => setProperty({ ...property, bedroomsTotal: e.target.value })} />
                      </div>
                      <div className="space-y-2">
                        <Label>Bathrooms Total</Label>
                        <Input type="number" min={1} value={property.bathroomsTotalInteger} onChange={(e) => setProperty({ ...property, bathroomsTotalInteger: e.target.value })} />
                      </div>
                    </>
                  )}
                  <div className="space-y-2">
                    <Label>Year Built</Label>
                    <Input type="number" min={1600} value={property.yearBuilt} onChange={(e) => setProperty({ ...property, yearBuilt: e.target.value })} placeholder="e.g. 2005" />
                  </div>
                  <div className="space-y-2">
                    <Label>Stories</Label>
                    <Input type="number" min={1} value={property.stories} onChange={(e) => setProperty({ ...property, stories: e.target.value })} placeholder="e.g. 2" />
                  </div>
                  <div className="space-y-2">
                    <Label>Lot Size Area</Label>
                    <Input type="number" min={0} value={property.lotSizeArea} onChange={(e) => setProperty({ ...property, lotSizeArea: e.target.value })} placeholder="e.g. 10000" />
                  </div>
                  <div className="space-y-2">
                    <Label>Lot Size Units</Label>
                    <Select value={property.lotSizeUnits} onChange={(e) => setProperty({ ...property, lotSizeUnits: e.target.value })}>
                      <option value="Square Feet">Square Feet</option>
                      <option value="Acres">Acres</option>
                      <option value="Square Meters">Square Meters</option>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Living Area</Label>
                    <Input type="number" min={0} value={property.livingArea} onChange={(e) => setProperty({ ...property, livingArea: e.target.value })} placeholder="e.g. 2400" />
                  </div>
                  <div className="space-y-2">
                    <Label>Living Area Units</Label>
                    <Select value={property.livingAreaUnits} onChange={(e) => setProperty({ ...property, livingAreaUnits: e.target.value })}>
                      <option value="Square Feet">Square Feet</option>
                      <option value="Square Meters">Square Meters</option>
                    </Select>
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <Label>Universal Property ID (UPI)</Label>
                    <Input value={property.universalPropertyIdentifier} onChange={(e) => setProperty({ ...property, universalPropertyIdentifier: e.target.value })} placeholder="Optional" />
                  </div>
                </div>
                <Separator />
                <div className="grid gap-5 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Street Number</Label>
                    <Input value={property.streetNumber} onChange={(e) => setProperty({ ...property, streetNumber: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Street Name</Label>
                    <Input value={property.streetName} onChange={(e) => setProperty({ ...property, streetName: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Street Direction Prefix</Label>
                    <Select value={property.streetDirPrefix} onChange={(e) => setProperty({ ...property, streetDirPrefix: e.target.value })}>
                      <option value="">None</option>
                      <option value="N">N</option>
                      <option value="S">S</option>
                      <option value="E">E</option>
                      <option value="W">W</option>
                      <option value="NE">NE</option>
                      <option value="NW">NW</option>
                      <option value="SE">SE</option>
                      <option value="SW">SW</option>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Street Direction Suffix</Label>
                    <Select value={property.streetDirSuffix} onChange={(e) => setProperty({ ...property, streetDirSuffix: e.target.value })}>
                      <option value="">None</option>
                      <option value="N">N</option>
                      <option value="S">S</option>
                      <option value="E">E</option>
                      <option value="W">W</option>
                      <option value="NE">NE</option>
                      <option value="NW">NW</option>
                      <option value="SE">SE</option>
                      <option value="SW">SW</option>
                    </Select>
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <Label>Street Additional Info</Label>
                    <Input value={property.streetAdditionalInfo} onChange={(e) => setProperty({ ...property, streetAdditionalInfo: e.target.value })} placeholder="Apt, Suite, Unit, etc." />
                  </div>
                  <div className="space-y-2">
                    <Label>City</Label>
                    <Input value={property.city} onChange={(e) => setProperty({ ...property, city: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>State/Province</Label>
                    <Input value={property.stateOrProvince} onChange={(e) => setProperty({ ...property, stateOrProvince: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Postal Code</Label>
                    <Input value={property.postalCode} onChange={(e) => setProperty({ ...property, postalCode: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>County/Parish</Label>
                    <Input value={property.countyOrParish} onChange={(e) => setProperty({ ...property, countyOrParish: e.target.value })} />
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <Label>Occupancy Status</Label>
                    <Select value={property.occupancyStatus} onChange={(e) => setProperty({ ...property, occupancyStatus: e.target.value })}>
                      <option value="owner_occupied">Owner Occupied</option>
                      <option value="tenant_occupied">Tenant Occupied</option>
                      <option value="vacant">Vacant</option>
                    </Select>
                  </div>
                </div>
              </div>
            )}

            {section === "ownership_disclosures" && (
              <div className="space-y-5">
                <Checkbox label="This is my primary residence" checked={ownership.isPrimaryResidence} onChange={(e) => setOwnership({ ...ownership, isPrimaryResidence: (e.target as HTMLInputElement).checked })} />
                <Checkbox label="Property has an HOA" checked={ownership.hasHoa} onChange={(e) => setOwnership({ ...ownership, hasHoa: (e.target as HTMLInputElement).checked })} />
                {ownership.hasHoa && (
                  <div className="space-y-2 pl-8">
                    <Label>HOA Name / Contact Info</Label>
                    <Input value={ownership.hoaName} onChange={(e) => setOwnership({ ...ownership, hoaName: e.target.value })} placeholder="Name, phone, email" />
                  </div>
                )}
                <Checkbox label="Multiple owners" checked={ownership.multipleOwners} onChange={(e) => setOwnership({ ...ownership, multipleOwners: (e.target as HTMLInputElement).checked })} />
                <div className="space-y-2">
                  <Label>Primary Owner Name</Label>
                  <Input value={ownership.primaryOwnerName} onChange={(e) => setOwnership({ ...ownership, primaryOwnerName: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Known Defects / Disclosures</Label>
                  <textarea
                    className="flex min-h-[6rem] w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    value={ownership.knownDefects}
                    onChange={(e) => setOwnership({ ...ownership, knownDefects: e.target.value })}
                    placeholder="Describe any known issues..."
                  />
                </div>
                <div className="space-y-2">
                  <Label>Recent Renovations</Label>
                  <textarea
                    className="flex min-h-[6rem] w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    value={ownership.recentRenovations}
                    onChange={(e) => setOwnership({ ...ownership, recentRenovations: e.target.value })}
                    placeholder="New roof, kitchen remodel, etc."
                  />
                </div>
                <Checkbox label="Property has lead-based paint" checked={ownership.hasLeadPaint} onChange={(e) => setOwnership({ ...ownership, hasLeadPaint: (e.target as HTMLInputElement).checked })} />
                <div className="space-y-2">
                  <Label>Flood Zone</Label>
                  <Input value={ownership.floodZone} onChange={(e) => setOwnership({ ...ownership, floodZone: e.target.value })} placeholder="e.g. Zone X" />
                </div>
              </div>
            )}

            {section === "access_showings" && (
              <div className="space-y-5">
                <div className="space-y-2">
                  <Label>Occupancy Status</Label>
                  <Select value={access.occupancyStatus} onChange={(e) => setAccess({ ...access, occupancyStatus: e.target.value })}>
                    <option value="owner_occupied">Owner Occupied</option>
                    <option value="tenant_occupied">Tenant Occupied</option>
                    <option value="vacant">Vacant</option>
                  </Select>
                </div>
                <Checkbox label="Lockbox allowed" checked={access.lockboxAllowed} onChange={(e) => setAccess({ ...access, lockboxAllowed: (e.target as HTMLInputElement).checked })} />
                {access.occupancyStatus === "tenant_occupied" && (
                  <div className="space-y-2">
                    <Label>Showing Notice Hours</Label>
                    <Input type="number" min={0} value={access.showingNoticeHours} onChange={(e) => setAccess({ ...access, showingNoticeHours: e.target.value })} />
                  </div>
                )}
                <div className="space-y-2">
                  <Label>Gate Code</Label>
                  <Input value={access.gateCode} onChange={(e) => setAccess({ ...access, gateCode: e.target.value })} placeholder="Optional" />
                </div>
                <div className="space-y-2">
                  <Label>Alarm Instructions</Label>
                  <Input value={access.alarmInstructions} onChange={(e) => setAccess({ ...access, alarmInstructions: e.target.value })} placeholder="Optional" />
                </div>
                <div className="space-y-2">
                  <Label>Best Contact Method</Label>
                  <Select value={access.bestContactMethod} onChange={(e) => setAccess({ ...access, bestContactMethod: e.target.value })}>
                    <option value="email">Email</option>
                    <option value="sms">SMS</option>
                    <option value="call">Call</option>
                  </Select>
                </div>
                <div className="space-y-3">
                  <Label>Excluded Showing Days</Label>
                  <div className="flex flex-wrap gap-2">
                    {["mon", "tue", "wed", "thu", "fri", "sat", "sun"].map((day) => {
                      const active = access.excludedShowingDays.includes(day);
                      return (
                        <button
                          key={day}
                          type="button"
                          onClick={() => toggleDay(day)}
                          className={cn(
                            "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                            active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"
                          )}
                        >
                          {day.charAt(0).toUpperCase() + day.slice(1)}
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-xs text-muted-foreground">Select days when showings should not be scheduled.</p>
                </div>
                <Checkbox label="Pets present on property" checked={access.petsPresent} onChange={(e) => setAccess({ ...access, petsPresent: (e.target as HTMLInputElement).checked })} />
              </div>
            )}

            {section === "media_condition" && (
              <div className="space-y-5">
                <Checkbox label="Request professional photos" checked={media.hasProfessionalPhotos} onChange={(e) => setMedia({ ...media, hasProfessionalPhotos: (e.target as HTMLInputElement).checked })} />
                {media.hasProfessionalPhotos && (
                  <div className="grid gap-4 pl-8 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Photo Count (estimated)</Label>
                      <Input type="number" min={0} max={500} value={media.photoCount} onChange={(e) => setMedia({ ...media, photoCount: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <Label>Preferred Photo Date</Label>
                      <Input type="date" value={media.preferredPhotoDate} onChange={(e) => setMedia({ ...media, preferredPhotoDate: e.target.value })} />
                    </div>
                  </div>
                )}
                <div className="space-y-2">
                  <Label>Virtual Tour URL</Label>
                  <Input type="url" value={media.virtualTourUrl} onChange={(e) => setMedia({ ...media, virtualTourUrl: e.target.value })} placeholder="https://..." />
                </div>
                <Checkbox label="Request floorplan" checked={media.floorplanRequested} onChange={(e) => setMedia({ ...media, floorplanRequested: (e.target as HTMLInputElement).checked })} />
                <Checkbox label="Needs staging" checked={media.needsStaging} onChange={(e) => setMedia({ ...media, needsStaging: (e.target as HTMLInputElement).checked })} />
                {media.needsStaging && (
                  <div className="space-y-2 pl-8">
                    <Label>Staging Notes</Label>
                    <textarea
                      className="flex min-h-[4rem] w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      value={media.stagingNotes}
                      onChange={(e) => setMedia({ ...media, stagingNotes: e.target.value })}
                      placeholder="Specific requests or concerns..."
                    />
                  </div>
                )}
                <Separator />
                <Button type="button" variant="outline" onClick={uploadDocument} disabled={uploading} className="w-full sm:w-auto">
                  <Upload className="mr-2 h-4 w-4" />
                  {uploading ? "Uploading..." : "Upload Photo / Document"}
                </Button>
              </div>
            )}

            {section === "pricing_goals" && (
              <div className="grid gap-5 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Expected Price ($)</Label>
                  <Input type="number" min={0} value={pricing.expectedPrice} onChange={(e) => setPricing({ ...pricing, expectedPrice: e.target.value })} placeholder="e.g. 450000" />
                </div>
                <div className="space-y-2">
                  <Label>Minimum Price ($)</Label>
                  <Input type="number" min={0} value={pricing.minimumPrice} onChange={(e) => setPricing({ ...pricing, minimumPrice: e.target.value })} placeholder="e.g. 400000" />
                </div>
                <div className="space-y-2">
                  <Label>Target List Date</Label>
                  <Input type="date" value={pricing.targetListDate} onChange={(e) => setPricing({ ...pricing, targetListDate: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Urgency</Label>
                  <Select value={pricing.urgency} onChange={(e) => setPricing({ ...pricing, urgency: e.target.value })}>
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </Select>
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label>Pricing Strategy</Label>
                  <Select value={pricing.pricingStrategy} onChange={(e) => setPricing({ ...pricing, pricingStrategy: e.target.value })}>
                    <option value="aggressive">Aggressive</option>
                    <option value="market">Market</option>
                    <option value="conservative">Conservative</option>
                  </Select>
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label>Seller Motivation</Label>
                  <Input value={pricing.sellerMotivation} onChange={(e) => setPricing({ ...pricing, sellerMotivation: e.target.value })} placeholder="Relocating, downsizing, investment sale, etc." />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label>Appraisal Disputes / Concerns</Label>
                  <textarea
                    className="flex min-h-[5rem] w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    value={pricing.appraisalDisputes}
                    onChange={(e) => setPricing({ ...pricing, appraisalDisputes: e.target.value })}
                    placeholder="Any known appraisal challenges..."
                  />
                </div>
                <div className="sm:col-span-2">
                  <Checkbox label="Financing considerations discussed" checked={pricing.financingConsidered} onChange={(e) => setPricing({ ...pricing, financingConsidered: (e.target as HTMLInputElement).checked })} />
                </div>
              </div>
            )}

            {section === "review_submit" && (
              <div className="space-y-4">
                <div className="rounded-xl border bg-muted/40 p-4">
                  <h4 className="mb-3 font-medium">Section Checklist</h4>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {SECTIONS.slice(0, -1).map((s) => {
                      const complete = sectionComplete(s.key);
                      return (
                        <div
                          key={s.key}
                          className={cn(
                            "flex items-center gap-3 rounded-lg border px-3 py-2 text-sm",
                            complete ? "border-primary/20 bg-primary/5" : "border-muted bg-background"
                          )}
                        >
                          <div
                            className={cn(
                              "flex h-6 w-6 items-center justify-center rounded-full",
                              complete ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                            )}
                          >
                            {complete ? <Check className="h-3.5 w-3.5" /> : <span className="text-xs">{SECTIONS.indexOf(s) + 1}</span>}
                          </div>
                          <span className={complete ? "text-foreground" : "text-muted-foreground"}>{s.label}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div className="space-y-3 rounded-xl border p-4">
                  <Checkbox label="I agree to the terms and conditions" checked={review.termsAccepted} onChange={(e) => setReview({ ...review, termsAccepted: (e.target as HTMLInputElement).checked })} />
                  <Checkbox label="I confirm the accuracy of the information provided" checked={review.accuracyConfirmed} onChange={(e) => setReview({ ...review, accuracyConfirmed: (e.target as HTMLInputElement).checked })} />
                  <div className="space-y-2 pt-2">
                    <Label>Electronic Signature</Label>
                    <Input value={review.signature} onChange={(e) => setReview({ ...review, signature: e.target.value })} placeholder="Type your full name" />
                  </div>
                  <div className="space-y-2">
                    <Label>Additional Notes</Label>
                    <textarea
                      className="flex min-h-[4rem] w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      value={review.notes}
                      onChange={(e) => setReview({ ...review, notes: e.target.value })}
                      placeholder="Anything else we should know?"
                    />
                  </div>
                </div>
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Ready to submit?</AlertTitle>
                  <AlertDescription>Make sure all sections are complete. You can come back later if needed.</AlertDescription>
                </Alert>
              </div>
            )}
          </CardContent>

          <CardFooter className="flex items-center justify-between gap-4">
            <div className="flex gap-2">
              {activeIndex > 0 && (
                <Button variant="outline" onClick={() => setSection(SECTIONS[activeIndex - 1].key)}>
                  Back
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              {section !== "review_submit" ? (
                <Button onClick={saveSection} disabled={loading}>
                  {loading ? "Saving..." : "Save & Continue"}
                  <ChevronRight className="ml-2 h-4 w-4" />
                </Button>
              ) : (
                <Button onClick={submitIntake} disabled={loading || !review.termsAccepted || !review.accuracyConfirmed}>
                  {loading ? "Submitting..." : "Submit Intake"}
                </Button>
              )}
            </div>
          </CardFooter>
        </Card>

        <p className="mt-6 text-center text-xs text-muted-foreground">Need help? Contact your listing coordinator anytime.</p>
      </div>
    </div>
  );
}

function cn(...inputs: (string | undefined | null | false)[]) {
  return inputs.filter(Boolean).join(" ");
}
