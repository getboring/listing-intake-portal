import { describe, it, expect } from "vitest";
import {
  validateSection,
  validateIntakeBusinessRules,
  runFullValidation,
} from "./engine.js";
import type { SectionKey, ValidationIssue } from "~/domains/types.js";

function yesterdayISO(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString();
}

function tomorrowISO(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString();
}

function fourDaysFromNowISO(): string {
  const d = new Date();
  d.setDate(d.getDate() + 4);
  return d.toISOString();
}

describe("validateSection", () => {
  it("property_details: valid residential passes", () => {
    const issues = validateSection("property_details", {
      propertyType: "Residential",
      bedroomsTotal: 3,
      bathroomsTotalInteger: 2,
      occupancyStatus: "owner_occupied",
    });
    expect(issues).toHaveLength(0);
  });

  it("property_details: residential missing bedroomsTotal fails", () => {
    const issues = validateSection("property_details", {
      propertyType: "Residential",
      bathroomsTotalInteger: 2,
      occupancyStatus: "owner_occupied",
    });
    expect(issues.some((i) => i.fieldPath?.includes("bedroomsTotal"))).toBe(true);
  });

  it("property_details: residential missing bathroomsTotalInteger fails", () => {
    const issues = validateSection("property_details", {
      propertyType: "Residential",
      bedroomsTotal: 3,
      occupancyStatus: "owner_occupied",
    });
    expect(issues.some((i) => i.message.toLowerCase().includes("bathroom"))).toBe(true);
  });

  it("property_details: land missing lotSizeArea fails", () => {
    const issues = validateSection("property_details", {
      propertyType: "Land",
      occupancyStatus: "vacant",
    });
    expect(issues.some((i) => i.fieldPath?.includes("lotSizeArea"))).toBe(true);
  });

  it("property_details: yearBuilt out of range fails", () => {
    const issues = validateSection("property_details", {
      propertyType: "Residential",
      bedroomsTotal: 2,
      bathroomsTotalInteger: 1,
      occupancyStatus: "owner_occupied",
      yearBuilt: 1500,
    });
    expect(issues.some((i) => i.fieldPath === "yearBuilt")).toBe(true);
  });

  it("access_showings: tenant_occupied missing showingNoticeHours fails", () => {
    const issues = validateSection("access_showings", {
      occupancyStatus: "tenant_occupied",
      lockboxAllowed: true,
    });
    expect(issues.some((i) => i.fieldPath?.includes("showingNoticeHours"))).toBe(true);
  });

  it("ownership_disclosures: hasHOA true missing hoaContactInfo fails", () => {
    const issues = validateSection("ownership_disclosures", {
      hasHOA: true,
    });
    const hoaIssue = issues.find((i) => i.code === "section.hoa_contact_missing");
    expect(hoaIssue).toBeDefined();
    expect(hoaIssue?.blocking).toBe(true);
    expect(hoaIssue?.fieldPath).toBe("hoaContactInfo");
  });

  it("media_condition: photosRequested true missing preferredPhotoDate fails", () => {
    const issues = validateSection("media_condition", {
      photosRequested: true,
    });
    const photoIssue = issues.find((i) => i.code === "section.photo_date_missing");
    expect(photoIssue).toBeDefined();
    expect(photoIssue?.blocking).toBe(true);
    expect(photoIssue?.fieldPath).toBe("preferredPhotoDate");
  });

  it("pricing_goals: listPrice < $10,000 fails", () => {
    const issues = validateSection("pricing_goals", {
      listPrice: 999_99, // $9,999.99 in cents... wait the code says 10_000_00 which is $1,000,000? No, it's 1,000,000 cents = $10,000.
    });
    const priceIssue = issues.find((i) => i.code === "section.price_too_low");
    expect(priceIssue).toBeDefined();
    expect(priceIssue?.blocking).toBe(true);
  });
});

describe("validateIntakeBusinessRules", () => {
  it("tenant_occupied without showingNoticeHours -> blocking", () => {
    const issues = validateIntakeBusinessRules({
      sections: {
        property_details: { status: "complete", payload: { occupancyStatus: "tenant_occupied" } },
        access_showings: { status: "complete", payload: { occupancyStatus: "tenant_occupied", lockboxAllowed: true } },
      },
      documents: [],
      checklist: {},
    });
    const issue = issues.find((i) => i.code === "rule.tenant_notice_missing");
    expect(issue).toBeDefined();
    expect(issue!.blocking).toBe(true);
  });

  it("multipleOwners true without deed document -> warning", () => {
    const issues = validateIntakeBusinessRules({
      sections: {
        ownership_disclosures: { status: "complete", payload: { multipleOwners: true } },
      },
      documents: [{ documentType: "photo" }],
      checklist: {},
    });
    const issue = issues.find((i) => i.code === "rule.deed_suggested");
    expect(issue).toBeDefined();
    expect(issue!.blocking).toBe(false);
  });

  it("targetListDate in past -> blocking error (past_list_date)", () => {
    const issues = validateIntakeBusinessRules({
      sections: {},
      documents: [],
      checklist: {},
      targetListDate: yesterdayISO(),
    });
    const issue = issues.find((i) => i.code === "rule.past_list_date");
    expect(issue).toBeDefined();
    expect(issue!.blocking).toBe(true);
  });

  it("targetListDate within 3 days -> warning (short_list_date)", () => {
    const issues = validateIntakeBusinessRules({
      sections: {},
      documents: [],
      checklist: {},
      targetListDate: tomorrowISO(),
    });
    const issue = issues.find((i) => i.code === "rule.short_list_date");
    expect(issue).toBeDefined();
    expect(issue!.blocking).toBe(false);
  });

  it("targetListDate more than 3 days -> no short_list_date warning", () => {
    const issues = validateIntakeBusinessRules({
      sections: {},
      documents: [],
      checklist: {},
      targetListDate: fourDaysFromNowISO(),
    });
    const issue = issues.find((i) => i.code === "rule.short_list_date");
    expect(issue).toBeUndefined();
  });

  it("media_condition complete without photo -> blocking", () => {
    const issues = validateIntakeBusinessRules({
      sections: {
        media_condition: { status: "complete", payload: {} },
      },
      documents: [],
      checklist: {},
    });
    const issue = issues.find((i) => i.code === "rule.photos_required_for_media_complete");
    expect(issue).toBeDefined();
    expect(issue!.blocking).toBe(true);
  });

  it("media_condition complete with photo -> no blocking", () => {
    const issues = validateIntakeBusinessRules({
      sections: {
        media_condition: { status: "complete", payload: {} },
      },
      documents: [{ documentType: "photo" }],
      checklist: {},
    });
    const issue = issues.find((i) => i.code === "rule.photos_required_for_media_complete");
    expect(issue).toBeUndefined();
  });

  it("listPrice > $50M -> blocking", () => {
    const issues = validateIntakeBusinessRules({
      sections: {
        pricing_goals: { status: "complete", payload: { listPrice: 50_000_000_01 } },
      },
      documents: [],
      checklist: {},
    });
    const issue = issues.find((i) => i.code === "rule.price_excessive");
    expect(issue).toBeDefined();
    expect(issue!.blocking).toBe(true);
  });
});

describe("runFullValidation", () => {
  it("aggregates counts correctly", () => {
    const result = runFullValidation("intake-1", {
      sections: {
        property_details: {
          status: "complete",
          payload: {
            propertyType: "Residential",
            occupancyStatus: "owner_occupied",
            // missing bedroomsTotal and bathroomsTotalInteger
          },
        },
        media_condition: {
          status: "complete",
          payload: {
            photosRequested: true,
            // missing preferredPhotoDate
          },
        },
        pricing_goals: {
          status: "complete",
          payload: {
            listPrice: 999_99, // too low
          },
        },
      },
      documents: [],
      checklist: {},
      targetListDate: yesterdayISO(),
    });

    expect(result.intakeId).toBe("intake-1");

    // property_details: 2 field issues (bedroomsTotal + bathroomsTotalInteger)
    // media_condition: 1 field issue (preferredPhotoDate)
    // pricing_goals: 1 field issue (listPrice)
    expect(result.fieldIssues.length).toBeGreaterThan(0);

    // business rule: past_list_date (1 blocking)
    expect(result.businessIssues.length).toBeGreaterThan(0);

    // allIssues = field + section + business
    expect(result.allIssues.length).toBe(result.fieldIssues.length + result.sectionIssues.length + result.businessIssues.length);

    // blocking count should be sum of blocking issues
    const manualBlocking = result.allIssues.filter((i) => i.blocking).length;
    expect(result.blockingCount).toBe(manualBlocking);

    // warning count should be sum of non-blocking issues
    const manualWarning = result.allIssues.filter((i) => !i.blocking).length;
    expect(result.warningCount).toBe(manualWarning);
  });
});
