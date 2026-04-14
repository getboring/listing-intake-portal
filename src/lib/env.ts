export interface Env {
  DB: D1Database;
  LISTING_INTAKE_DO: DurableObjectNamespace;
  DOCUMENTS_BUCKET: R2Bucket;
  INTAKE_QUEUE: Queue;
  WEBHOOK_SECRET?: string;
}
