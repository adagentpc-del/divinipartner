/**
 * Phase 3 Intelligence - AI Quote Assist routes.
 * Mount base: /quote-assist (the lead wires the mount in routes.ts).
 *
 *   POST /            deterministic draft scope/notes/timeline for a
 *                     venue + branding opportunity (+ optional vendor pricing)
 *
 * This is quote ACCELERATION surfaced as an "assist". It COMPOSES the existing
 * deterministic engines via server/src/lib/aiQuoteAssist.ts
 * (quoteAutomation.buildQuotePrefill + draftQuote.assembleDraftQuote). The
 * default path is 100% deterministic and makes NO AI call. The optional AI
 * refinement seam in aiQuoteAssist.ts is feature-flagged OFF and is never
 * invoked here, honoring the platform cost rules.
 *
 * IDOR posture: mirrors server/src/routes/quote-drafts.ts. The actor must own
 * the venue (venues.organization_id) or be an admin, and the vendor pricing
 * rules (when a vendor_id is supplied) are read by SQL only for a vendor the
 * actor's org owns. A forged venue/opportunity is rejected (403/404). This is
 * read-only: it computes a draft and returns it; it persists nothing (persisting
 * stays in quote-drafts.ts).
 *
 * Zero em dashes.
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { getAuth, requireUser } from "../auth.js";
import * as db from "../db.js";
import { q1 } from "../pool.js";
import { ForbiddenError, NotFoundError } from "../db.js";
import { assembleQuoteAssist } from "../lib/aiQuoteAssist.js";
import type { PricingRules } from "../lib/pricingEngine.js";

const h =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch(next);

async function actor(req: Request): Promise<db.Actor> {
  const auth = getAuth(req);
  return db.getActor(auth.userId!, auth.email);
}

function isAdmin(a: db.Actor): boolean {
  return a.user.role === "super_admin" || a.user.role === "admin";
}

/**
 * Assert the actor may build an assist for this venue: their org owns the venue,
 * or they are an admin. Throws NotFound when the venue is missing, Forbidden when
 * it belongs to another tenant.
 */
async function assertVenueAccess(a: db.Actor, venueId: string): Promise<void> {
  const row = await q1<{ organization_id: string | null }>(
    `select organization_id from venues where id = $1`,
    [venueId],
  );
  if (!row) throw new NotFoundError("venue not found");
  if (isAdmin(a)) return;
  if (!a.org?.id || row.organization_id !== a.org.id) {
    throw new ForbiddenError("no access to this venue");
  }
}

/** The org that owns a vendor row (vendor-side authorization boundary). */
async function vendorOrgId(vendorId: string): Promise<string | null> {
  const row = await q1<{ organization_id: string | null }>(
    `select organization_id from vendors where id = $1`,
    [vendorId],
  );
  return row?.organization_id ?? null;
}

const router = Router();
router.use(requireUser);

/**
 * Build a deterministic quote-assist payload for a venue + branding opportunity.
 * Optional vendor_id pulls that vendor's pricing rules (only when the actor's org
 * owns the vendor). The AI refinement seam is OFF and not called.
 */
router.post(
  "/",
  h(async (req, res) => {
    const a = await actor(req);
    const { venue_id, branding_opportunity_id, vendor_id, service_category } = req.body ?? {};
    if (!venue_id) return res.status(400).json({ error: "venue_id required" });
    if (!branding_opportunity_id) {
      return res.status(400).json({ error: "branding_opportunity_id required" });
    }

    // IDOR gate: the actor must own the venue (or be admin).
    await assertVenueAccess(a, venue_id);

    // Optional vendor pricing rules, read by SQL, only for a vendor the actor owns.
    let pricingRules: PricingRules | null = null;
    let baseUnit: string | null = null;
    if (vendor_id) {
      if (!isAdmin(a)) {
        const ownerOrg = await vendorOrgId(vendor_id);
        if (!ownerOrg || ownerOrg !== a.org?.id) {
          throw new ForbiddenError("no access to this vendor's pricing");
        }
      }
      const category = service_category ?? null;
      const pr = await q1<{ rules: unknown; base_unit: string | null }>(
        category
          ? `select rules, base_unit from vendor_pricing_rules
               where vendor_id = $1 and service_category = $2
               order by updated_at desc limit 1`
          : `select rules, base_unit from vendor_pricing_rules
               where vendor_id = $1 order by updated_at desc limit 1`,
        category ? [vendor_id, category] : [vendor_id],
      );
      if (pr) {
        pricingRules = (pr.rules as PricingRules) ?? null;
        baseUnit = pr.base_unit ?? null;
      }
    }

    const result = await assembleQuoteAssist({
      venueId: venue_id,
      brandingOpportunityId: branding_opportunity_id,
      serviceCategory: service_category ?? null,
      pricingRules,
      baseUnit,
    });
    if (!result) {
      return res.status(404).json({ error: "branding opportunity not found for this venue" });
    }

    res.json({ assist: result });
  }),
);

export default router;
