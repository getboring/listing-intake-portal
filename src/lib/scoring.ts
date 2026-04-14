import type { SectionKey } from "~/domains/types.js";

const sectionWeights: Record<SectionKey, number> = {
  contact_info: 10,
  property_details: 20,
  ownership_disclosures: 20,
  access_showings: 15,
  media_condition: 15,
  pricing_goals: 10,
  review_submit: 10,
  complete: 0,
};

export interface SectionInput {
  status: "not_started" | "in_progress" | "complete" | string;
  completionRatio?: number;
}

export interface ReadinessInputs {
  dataCompleteness: number;
  validationHealth: number;
  documentCompleteness: number;
  reviewClearance: number;
  mediaPreparedness: number;
  showingReadiness: number;
  pricingReadiness: number;
}

export interface FrictionInputs {
  blockingErrors: number;
  warningErrors: number;
  overdueTasks: number;
  pendingRequiredDocs: number;
  stalledDays: number;
}

function statusToRatio(status: string): number {
  switch (status) {
    case "complete":
      return 1;
    case "in_progress":
      return 0.5;
    case "not_started":
    default:
      return 0;
  }
}

export function calculateCompletionPercent(
  sections: Record<string, SectionInput>
): number {
  let weightedSum = 0;
  let totalWeight = 0;

  for (const [key, weight] of Object.entries(sectionWeights)) {
    if (key === "complete") continue;

    const section = sections[key];
    const ratio =
      section?.completionRatio ?? statusToRatio(section?.status ?? "not_started");

    weightedSum += weight * ratio;
    totalWeight += weight;
  }

  if (totalWeight === 0) return 0;

  const percent = (weightedSum / totalWeight) * 100;
  return Math.min(100, Math.max(0, percent));
}

export function calculateReadinessScore(inputs: ReadinessInputs): number {
  const raw =
    0.2 * inputs.dataCompleteness +
    0.2 * inputs.validationHealth +
    0.2 * inputs.documentCompleteness +
    0.15 * inputs.reviewClearance +
    0.1 * inputs.mediaPreparedness +
    0.1 * inputs.showingReadiness +
    0.05 * inputs.pricingReadiness;

  return Math.min(100, Math.max(0, Math.round(raw)));
}

export function calculateFrictionScore(inputs: FrictionInputs): number {
  return (
    5 * inputs.blockingErrors +
    3 * inputs.warningErrors +
    2 * inputs.overdueTasks +
    2 * inputs.pendingRequiredDocs +
    1 * inputs.stalledDays
  );
}
