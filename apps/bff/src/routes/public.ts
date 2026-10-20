/** Unauthenticated, cacheable endpoints for the marketing site. */
import { Hono } from "hono";
import { countMergedPullRequests } from "../services/merged-pull-requests";

export function createPublicRoutes(countMerged: () => Promise<number>) {
  const routes = new Hono();

  routes.get("/stats", async (c) => {
    const prsMerged = await countMerged();

    // Public aggregate fetched without credentials, so any origin may read it
    c.header("Access-Control-Allow-Origin", "*");
    c.header("Cache-Control", "public, max-age=60");
    return c.json({ prsMerged });
  });

  return routes;
}

const publicRoutes = createPublicRoutes(countMergedPullRequests);

export { publicRoutes };
