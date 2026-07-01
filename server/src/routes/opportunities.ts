/**
 * Intelligence Moat - Feature 13: Opportunity Engine (daily feed) routes.
 * Mount base: /api/opportunities (the lead wires the mount in routes.ts).
 *
 *   GET  /                 the actor's role-scoped open feed
 *                          (?role=&status=&limit=)
 *   POST /generate         regenerate the actor's feed for a role { role? } and
 *                          return it
 *   POST /:id/dismiss      mark one opportunity dismissed (audience-scoped)
 *
 * Mirrors the existing route patterns: requireUser guard, getActor via actor(),
 * the h() async wrapper, 400 on bad input, and 403/404 from the repo's
 * ForbiddenError/NotFoundError. The feed is audience-scoped in the repo, so an
 * actor only ever sees and mutates opportunities targeted at their org/user/role.
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { getAuth, requireUser } from "../auth.js";
import * as db from "../db.js";
import * as opp from "../db/opportunity.js";
import type { OpportunityRole } from "../lib/opportunityEngine.js";

const h =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch(next);

async function actor(req: Request): Promise<db.Actor> {
  const auth = getAuth(req);
  return db.getActor(auth.userId!, auth.email);
}

const ROLES = new Set<OpportunityRole>(["venue", "vendor", "planner", "sponsor", "client"]);

function asRole(v: unknown): OpportunityRole | null {
  return typeof v === "string" && ROLES.has(v as OpportunityRole) ? (v as OpportunityRole) : null;
}

const router = Router();
router.use(requireUser);

/** The actor's role-scoped opportunity feed. */
router.get(
  "/",
  h(async (req, res) => {
    const a = await actor(req);
    const role = typeof req.query.role === "string" ? req.query.role : null;
    const status = typeof req.query.status === "string" ? req.query.status : null;
    const limit =
      typeof req.query.limit === "string" && req.query.limit.trim() ? Number(req.query.limit) : undefined;
    const items = await opp.listOpportunities(a, { role, status, limit });
    res.json({ opportunities: items });
  }),
);

/**
 * Regenerate the actor's feed for a role and return the fresh rows. The role
 * defaults to the actor's own role when not supplied / invalid.
 */
router.post(
  "/generate",
  h(async (req, res) => {
    const a = await actor(req);
    const body = (req.body ?? {}) as Record<string, unknown>;
    const role = asRole(body.role) ?? asRole(a.user.role) ?? null;
    if (!role) {
      return res
        .status(400)
        .json({ error: "role required (venue | vendor | planner | sponsor | client)" });
    }
    const items = await opp.generateAndStoreFeed(a, role);
    res.json({ opportunities: items, role });
  }),
);

/** Dismiss one opportunity (audience-scoped in the repo). */
router.post(
  "/:id/dismiss",
  h(async (req, res) => {
    const a = await actor(req);
    const row = await opp.setOpportunityStatus(a, req.params.id, "dismissed");
    res.json({ opportunity: row });
  }),
);

export default router;
