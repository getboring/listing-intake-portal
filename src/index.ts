import { Hono } from "hono";
import { apiRoutes } from "./api/index.js";
import { ListingIntakeDO } from "./durable-objects/listing-intake-do.js";
import type { Env } from "./lib/env.js";

const app = new Hono<{ Bindings: Env }>();
app.route("/", apiRoutes);

export default app;
export { ListingIntakeDO };
