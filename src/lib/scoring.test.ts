import { describe, it, expect } from "vitest";
import {
  calculateCompletionPercent,
  calculateReadinessScore,
  calculateFrictionScore,
} from "./scoring.js";
import type { SectionInput, ReadinessInputs, FrictionInputs } from "./scoring.js";

function makeSections(statusMap: Record<string, SectionInput["status"]>): Record<string, SectionInput> {
  const keys = [
    "contact_info",
    "property_details",
    "ownership_disclosures",
    "access_showings",
    "media_condition",
    "pricing_goals",
    "review_submit",
  ];
  const sections: Record<string, SectionInput> = {};
  for (const key of keys) {
    sections[key] = { status: statusMap[key] ?? "not_started" };
  }
  return sections;
}

describe("calculateCompletionPercent", () => {
  it("returns 100% when all sections are complete", () => {
    const sections = makeSections({
      contact_info: "complete",
      property_details: "complete",
      ownership_disclosures: "complete",
      access_showings: "complete",
      media_condition: "complete",
      pricing_goals: "complete",
      review_submit: "complete",
    });
    expect(calculateCompletionPercent(sections)).toBe(100);
  });

  it("calculates half complete with correct weights", () => {
    // Half of sections complete, half not_started
    // Weights: 10,20,20,15,15,10,10 = 100 total
    // complete: contact_info(10) + property_details(20) + access_showings(15) = 45
    // not_started: ownership_disclosures(20) + media_condition(15) + pricing_goals(10) + review_submit(10) = 0
    // percent = 45/100 * 100 = 45
    const sections = {
      contact_info: { status: "complete" },
      property_details: { status: "complete" },
      ownership_disclosures: { status: "not_started" },
      access_showings: { status: "complete" },
      media_condition: { status: "not_started" },
      pricing_goals: { status: "not_started" },
      review_submit: { status: "not_started" },
    };
    expect(calculateCompletionPercent(sections)).toBe(45);
  });

  it("returns 0% for empty sections", () => {
    expect(calculateCompletionPercent({})).toBe(0);
  });

  it("uses completionRatio when provided", () => {
    const sections = {
      contact_info: { status: "not_started", completionRatio: 0.5 },
      property_details: { status: "not_started", completionRatio: 0.5 },
      ownership_disclosures: { status: "not_started", completionRatio: 0.5 },
      access_showings: { status: "not_started", completionRatio: 0.5 },
      media_condition: { status: "not_started", completionRatio: 0.5 },
      pricing_goals: { status: "not_started", completionRatio: 0.5 },
      review_submit: { status: "not_started", completionRatio: 0.5 },
    };
    expect(calculateCompletionPercent(sections)).toBe(50);
  });

  it("uses status fallback when completionRatio is omitted", () => {
    const sections = makeSections({
      contact_info: "in_progress",
      property_details: "in_progress",
      ownership_disclosures: "in_progress",
      access_showings: "in_progress",
      media_condition: "in_progress",
      pricing_goals: "in_progress",
      review_submit: "in_progress",
    });
    // All in_progress = 0.5 ratio each
    expect(calculateCompletionPercent(sections)).toBe(50);
  });
});

describe("calculateReadinessScore", () => {
  it("computes exact formula with sample inputs", () => {
    const inputs: ReadinessInputs = {
      dataCompleteness: 80,
      validationHealth: 90,
      documentCompleteness: 70,
      reviewClearance: 60,
      mediaPreparedness: 50,
      showingReadiness: 40,
      pricingReadiness: 30,
    };
    // 0.2*80 + 0.2*90 + 0.2*70 + 0.15*60 + 0.1*50 + 0.1*40 + 0.05*30
    // = 16 + 18 + 14 + 9 + 5 + 4 + 1.5 = 67.5 -> round = 68
    expect(calculateReadinessScore(inputs)).toBe(68);
  });

  it("rounds behavior (0.5 rounds up)", () => {
    const inputs: ReadinessInputs = {
      dataCompleteness: 50,
      validationHealth: 50,
      documentCompleteness: 50,
      reviewClearance: 50,
      mediaPreparedness: 50,
      showingReadiness: 50,
      pricingReadiness: 50,
    };
    expect(calculateReadinessScore(inputs)).toBe(50);
  });

  it("rounds 67.4 down to 67", () => {
    const inputs: ReadinessInputs = {
      dataCompleteness: 80,
      validationHealth: 90,
      documentCompleteness: 70,
      reviewClearance: 60,
      mediaPreparedness: 50,
      showingReadiness: 40,
      pricingReadiness: 28,
    };
    // 16 + 18 + 14 + 9 + 5 + 4 + 1.4 = 67.4 -> round = 67
    expect(calculateReadinessScore(inputs)).toBe(67);
  });

  it("clamps to 0 and 100", () => {
    expect(
      calculateReadinessScore({
        dataCompleteness: -10,
        validationHealth: 0,
        documentCompleteness: 0,
        reviewClearance: 0,
        mediaPreparedness: 0,
        showingReadiness: 0,
        pricingReadiness: 0,
      })
    ).toBe(0);

    expect(
      calculateReadinessScore({
        dataCompleteness: 200,
        validationHealth: 200,
        documentCompleteness: 200,
        reviewClearance: 200,
        mediaPreparedness: 200,
        showingReadiness: 200,
        pricingReadiness: 200,
      })
    ).toBe(100);
  });
});

describe("calculateFrictionScore", () => {
  it("returns 0 for zero inputs", () => {
    const inputs: FrictionInputs = {
      blockingErrors: 0,
      warningErrors: 0,
      overdueTasks: 0,
      pendingRequiredDocs: 0,
      stalledDays: 0,
    };
    expect(calculateFrictionScore(inputs)).toBe(0);
  });

  it("computes formula with mixed inputs", () => {
    const inputs: FrictionInputs = {
      blockingErrors: 2,
      warningErrors: 3,
      overdueTasks: 1,
      pendingRequiredDocs: 4,
      stalledDays: 5,
    };
    // 5*2 + 3*3 + 2*1 + 2*4 + 1*5 = 10 + 9 + 2 + 8 + 5 = 34
    expect(calculateFrictionScore(inputs)).toBe(34);
  });

  it("handles single blocking error", () => {
    const inputs: FrictionInputs = {
      blockingErrors: 1,
      warningErrors: 0,
      overdueTasks: 0,
      pendingRequiredDocs: 0,
      stalledDays: 0,
    };
    expect(calculateFrictionScore(inputs)).toBe(5);
  });

  it("handles stalled days only", () => {
    const inputs: FrictionInputs = {
      blockingErrors: 0,
      warningErrors: 0,
      overdueTasks: 0,
      pendingRequiredDocs: 0,
      stalledDays: 7,
    };
    expect(calculateFrictionScore(inputs)).toBe(7);
  });
});
