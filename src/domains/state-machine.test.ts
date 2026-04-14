import { describe, it, expect } from "vitest";
import {
  canTransitionStatus,
  advanceStage,
  allRequiredSectionsComplete,
  noBlockingErrors,
  getAllowedNextStatuses,
} from "./state-machine.js";
import type { IntakeStatus, IntakeStage } from "./types.js";
import type { TransitionContext } from "./state-machine.js";

function makeContext(overrides: Partial<TransitionContext> = {}): TransitionContext {
  return {
    sections: {},
    issues: [],
    readinessScore: 0,
    requiredTasksComplete: false,
    role: "seller",
    ...overrides,
  };
}

function makeSections(status: string) {
  return {
    contact_info: { status },
    property_details: { status },
    ownership_disclosures: { status },
    access_showings: { status },
    media_condition: { status },
    pricing_goals: { status },
    review_submit: { status },
  };
}

describe("canTransitionStatus", () => {
  it("allows draft -> invited", () => {
    expect(canTransitionStatus("draft", "invited", makeContext())).toBe(true);
  });

  it("blocks draft -> submitted", () => {
    expect(canTransitionStatus("draft", "submitted", makeContext())).toBe(false);
  });

  it("allows in_progress -> submitted when all required sections complete and no blocking errors", () => {
    const ctx = makeContext({
      sections: makeSections("complete"),
      issues: [],
    });
    expect(canTransitionStatus("in_progress", "submitted", ctx)).toBe(true);
  });

  it("blocks in_progress -> submitted when sections incomplete", () => {
    const ctx = makeContext({
      sections: {
        contact_info: { status: "complete" },
        property_details: { status: "in_progress" },
        ownership_disclosures: { status: "complete" },
        access_showings: { status: "complete" },
        media_condition: { status: "complete" },
        pricing_goals: { status: "complete" },
      },
      issues: [],
    });
    expect(canTransitionStatus("in_progress", "submitted", ctx)).toBe(false);
  });

  it("blocks in_progress -> submitted when blocking errors exist", () => {
    const ctx = makeContext({
      sections: makeSections("complete"),
      issues: [
        { severity: "error", code: "x", message: "x", blocking: true, fieldPath: "x" },
      ],
    });
    expect(canTransitionStatus("in_progress", "submitted", ctx)).toBe(false);
  });

  it("blocks under_review -> approved when readinessScore < 60", () => {
    const ctx = makeContext({
      readinessScore: 59,
      requiredTasksComplete: true,
      role: "coordinator",
    });
    expect(canTransitionStatus("under_review", "approved", ctx)).toBe(false);
  });

  it("blocks under_review -> approved when requiredTasksComplete = false", () => {
    const ctx = makeContext({
      readinessScore: 60,
      requiredTasksComplete: false,
      role: "coordinator",
    });
    expect(canTransitionStatus("under_review", "approved", ctx)).toBe(false);
  });

  it("blocks under_review -> approved when role = seller", () => {
    const ctx = makeContext({
      readinessScore: 60,
      requiredTasksComplete: true,
      role: "seller",
    });
    expect(canTransitionStatus("under_review", "approved", ctx)).toBe(false);
  });

  it("allows under_review -> approved when score >= 60, tasks complete, role = coordinator", () => {
    const ctx = makeContext({
      readinessScore: 60,
      requiredTasksComplete: true,
      role: "coordinator",
    });
    expect(canTransitionStatus("under_review", "approved", ctx)).toBe(true);
  });

  it("applies same gates for blocked -> approved", () => {
    const base = {
      readinessScore: 60,
      requiredTasksComplete: true,
      role: "coordinator" as const,
    };
    expect(canTransitionStatus("blocked", "approved", makeContext(base))).toBe(true);

    expect(canTransitionStatus("blocked", "approved", makeContext({ ...base, readinessScore: 59 }))).toBe(false);
    expect(canTransitionStatus("blocked", "approved", makeContext({ ...base, requiredTasksComplete: false }))).toBe(false);
    expect(canTransitionStatus("blocked", "approved", makeContext({ ...base, role: "seller" }))).toBe(false);
  });

  it("allows submitted -> in_progress", () => {
    expect(canTransitionStatus("submitted", "in_progress", makeContext())).toBe(true);
  });

  it("allows under_review -> in_progress for reviewers", () => {
    expect(canTransitionStatus("under_review", "in_progress", makeContext({ role: "coordinator" }))).toBe(true);
    expect(canTransitionStatus("under_review", "in_progress", makeContext({ role: "seller" }))).toBe(false);
  });

  it("allows blocked -> in_progress for reviewers", () => {
    expect(canTransitionStatus("blocked", "in_progress", makeContext({ role: "coordinator" }))).toBe(true);
    expect(canTransitionStatus("blocked", "in_progress", makeContext({ role: "seller" }))).toBe(false);
  });
});

describe("advanceStage", () => {
  it("returns the first incomplete stage after the current stage", () => {
    const sections = {
      contact_info: { status: "complete" },
      property_details: { status: "complete" },
      ownership_disclosures: { status: "in_progress" },
      access_showings: { status: "not_started" },
      media_condition: { status: "not_started" },
      pricing_goals: { status: "not_started" },
      review_submit: { status: "not_started" },
    };
    expect(advanceStage("contact_info", sections, "draft" as IntakeStatus)).toBe("ownership_disclosures");
  });

  it("marks review_submit complete only when intakeStatus is submitted or beyond", () => {
    const sections = {
      contact_info: { status: "complete" },
      property_details: { status: "complete" },
      ownership_disclosures: { status: "complete" },
      access_showings: { status: "complete" },
      media_condition: { status: "complete" },
      pricing_goals: { status: "complete" },
      review_submit: { status: "not_started" },
    };
    expect(advanceStage("pricing_goals", sections, "draft" as IntakeStatus)).toBe("review_submit");
    expect(advanceStage("pricing_goals", sections, "in_progress" as IntakeStatus)).toBe("review_submit");
    expect(advanceStage("pricing_goals", sections, "submitted" as IntakeStatus)).toBe("complete");
    expect(advanceStage("pricing_goals", sections, "under_review" as IntakeStatus)).toBe("complete");
    expect(advanceStage("pricing_goals", sections, "blocked" as IntakeStatus)).toBe("complete");
    expect(advanceStage("pricing_goals", sections, "approved" as IntakeStatus)).toBe("complete");
  });

  it('returns "complete" when all sections are done', () => {
    const sections = makeSections("complete");
    expect(advanceStage("contact_info", sections, "approved" as IntakeStatus)).toBe("complete");
  });
});

describe("allRequiredSectionsComplete", () => {
  it("returns true when all pre-submit sections are complete", () => {
    expect(allRequiredSectionsComplete(makeSections("complete"))).toBe(true);
  });

  it("returns false when any pre-submit section is incomplete", () => {
    const sections = {
      contact_info: { status: "complete" },
      property_details: { status: "complete" },
      ownership_disclosures: { status: "complete" },
      access_showings: { status: "complete" },
      media_condition: { status: "complete" },
      pricing_goals: { status: "in_progress" },
    };
    expect(allRequiredSectionsComplete(sections)).toBe(false);
  });
});

describe("noBlockingErrors", () => {
  it("returns true when there are no blocking issues", () => {
    expect(noBlockingErrors([])).toBe(true);
    expect(noBlockingErrors([{ severity: "warning", code: "x", message: "x", blocking: false }])).toBe(true);
  });

  it("returns false when at least one issue is blocking", () => {
    expect(noBlockingErrors([{ severity: "error", code: "x", message: "x", blocking: true }])).toBe(false);
  });
});

describe("getAllowedNextStatuses", () => {
  it("allows admin to cancel from submitted/under_review/blocked/approved", () => {
    const adminCtx = makeContext({ role: "admin" });
    (["submitted", "under_review", "blocked", "approved"] as IntakeStatus[]).forEach((status) => {
      const allowed = getAllowedNextStatuses(status, adminCtx);
      expect(allowed).toContain("canceled");
    });
  });

  it("does not allow non-admin to cancel from submitted/under_review/blocked/approved", () => {
    const nonAdminRoles: Array<"agent" | "coordinator" | "seller"> = ["agent", "coordinator", "seller"];
    (["submitted", "under_review", "blocked", "approved"] as IntakeStatus[]).forEach((status) => {
      nonAdminRoles.forEach((role) => {
        const allowed = getAllowedNextStatuses(status, makeContext({ role }));
        expect(allowed).not.toContain("canceled");
      });
    });
  });
});
