/**
 * Intake Routing routes (Phase 1, Workstream A). Mount base: /api/intake-routing.
 *
 * Given an intake context (a venue / client org / event a lead concerns), resolve
 * which vendor team members own it via vendor_account_assignments (owner, then
 * backup, then collaborator), falling back to the org's admin members. Two
 * endpoints:
 *   POST /resolve   compute the routing (preview, no side effects)
 *   POST /          compute the routing AND notify the routed members
 *                   (notify.intakeAssigned via recipients-style email cleaning)
 *
 * Reads require the `view_intake` permission via the acting user's vendor
 * sub-role. Resolution is deterministic and IDOR-safe: it only ever reads the
 * actor's own org's assignments. Mirrors the h() wrapper + getActor patterns.
 *
 * Zero em dashes.
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { getAuth, requireUser } from "../auth.js";
import * as db from "../db.js";
import { routeIntake, type IntakeContext } from "../lib/intakeRouting.js";
import { requireVendorPermission } from "../lib/vendorTeam.js";
import { notify } from "../lib/notify.js";

const h =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch(next);

async function actor(req: Request): Promise<db.Actor> {
  const auth = getAuth(req);
  return db.getActor(auth.userId!, auth.email);
}

/** Pull a normalized intake context out of a request body. */
function readContext(body: unknown): IntakeContext {
  const b = (body ?? {}) as Record<string, unknown>;
  return {
    venue_id: typeof b.venue_id === "string" ? b.venue_id : null,
    client_org_id: typeof b.client_org_id === "string" ? b.client_org_id : null,
    event_id: typeof b.event_id === "string" ? b.event_id : null,
    services: Array.isArray(b.services) ? b.services.map((s) => String(s)) : null,
  };
}

function hasSubject(ctx: IntakeContext): boolean {
  return !!(ctx.venue_id || ctx.client_org_id || ctx.event_id);
}

const router = Router();
router.use(requireUser);

/** Preview routing for an intake context (no notifications). */
router.post(
  "/resolve",
  h(async (req, res) => {
    const a = await actor(req);
    await requireVendorPermission(a, "view_intake");
    const ctx = readContext(req.body);
    if (!hasSubject(ctx)) {
      return res.status(400).json({ error: "venue_id, client_org_id, or event_id required" });
    }
    res.json({ routing: await routeIntake(a, ctx) });
  }),
);

/**
 * Compute routing for an intake and notify the routed members. The optional
 * intake_label / event_name in the body is used in the notification subject. The
 * routing is returned so the caller can record the assignment id alongside.
 */
router.post(
  "/",
  h(async (req, res) => {
    const a = await actor(req);
    await requireVendorPermission(a, "view_intake");
    const ctx = readContext(req.body);
    if (!hasSubject(ctx)) {
      return res.status(400).json({ error: "venue_id, client_org_id, or event_id required" });
    }
    const b = (req.body ?? {}) as Record<string, unknown>;
    const label =
      (typeof b.intake_label === "string" && b.intake_label) ||
      (typeof b.event_name === "string" && b.event_name) ||
      "New intake";
    const intakeId = typeof b.intake_id === "string" ? b.intake_id : null;

    const routing = await routeIntake(a, ctx);

    let notified = false;
    if (routing.emails.length > 0) {
      await notify
        .intakeAssigned(routing.emails, label, {
          intake_id: intakeId,
          venue_id: ctx.venue_id,
          client_org_id: ctx.client_org_id,
          event_id: ctx.event_id,
          matched_subject: routing.matched_subject,
          fallback: routing.fallback,
        })
        .catch(() => null);
      notified = true;
    }

    res.status(201).json({ routing, notified });
  }),
);

export default router;
