export interface Env {
  DB: D1Database;
  LISTING_INTAKE_DO: DurableObjectNamespace;
  DOCUMENTS_BUCKET: R2Bucket;
  INTAKE_QUEUE: Queue;
  WEBHOOK_SECRET?: string;
  API_TOKEN?: string;
  MIN_READINESS_SCORE?: string;
  // JSON mapping of orgId -> MLSConnectionConfig secrets
  MLS_CONNECTIONS_JSON?: string;
}

export function getMinReadinessScore(env: Env): number {
  const parsed = parseInt(env.MIN_READINESS_SCORE || "60", 10);
  return Number.isFinite(parsed) ? parsed : 60;
}
