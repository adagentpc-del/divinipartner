/**
 * Venue Intelligence - quote-draft routes (Phase 3). Mount base: /api/quote-drafts.
 *
 * The "Fastest Path To Quote": generate a draft quote from the venue twin + a
 * branding opportunity + a vendor's requirements/pricing (quoteAutomation +
 * draftQuote + pricingEngine), then walk it through the review lifecycle:
 *   draft -> vendor_review -> vendor_approved -> client_delivered (or declined).
 *
 * Routes:
 *   POST   /generate            generate + persist a draft for an event
 *   GET    /                    list drafts the actor can see (?eventId= filter)
 *   GET    /:id                 one draft
 *   PATCH  /:id                 vendor edits scope/notes/price/status
 *   POST   /:id/approve         vendor marks the draft vendor_approved
 *   POST   /:id/deliver         owner/planner delivers the draft to the client
 *
 * Authorization mirrors server/src/routes/events.ts and server/src/db/events.ts:
 * requireUser, getActor, the h() async wrapper. Every draft is gated on the
 * actor being able to SEE its event (event owner org, client, planner, or an
 * attached vendor org) and EDIT actions additionally require the right party, so
 * a forged id from another tenant is rejected (403/404) rather than acted on.
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { getAuth, requireUser } from "../auth.js";
import * as db from "../db.js";
import { q, q1 } from "../pool.js";
import { NotFoundError, ForbiddenError } from "../db.js";
import { getEvent } from "../db/events.js";
import { buildQuotePrefill } from "../lib/quoteAutomation.js";
import { assembleDraftQuote } from "../lib/draftQuote.js";
import type { PricingRules } from "../lib/pricingEngine.js";

const h =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch(next);

async function actor(req: Request): Promise<db.Actor> {
  const auth = getAuth(req);
  return db.getActor(auth.userId!, auth.email);
}

const VALID_STATUS = new Set([
  "draft",
  "vendor_review",
  "vendor_approved",
  "client_delivered",
  "declined",
]);

type QuoteDraftRow = {
  id: string;
  event_id: string | null;
  venue_id: string | null;
  branding_opportunity_id: string | null;
  vendor_id: string | null;
  requirement_id: string | null;
  prefilled: unknown;
  scope_of_work: string | null;
  install_notes: string | null;
  removal_notes: string | null;
  compliance_notes: string | null;
  timeline: unknown;
  computed_price: string | null;
  status: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

function isAdmin(a: db.Actor): boolean {
  return a.user.role === "super_admin" || a.user.role === "admin";
}

/** The org id that owns a vendor row (the vendor-side authorization boundary). */
async function vendorOrgId(vendorId: string): Promise<string | null> {
  const row = await q1<{ organization_id: string | null }>(
    `select organization_id from vendors where id = $1`,
    [vendorId],
  );
  return row?.organization_id ?? null;
}

/** True when the actor's org is the vendor on this draft (or admin). */
async function actorIsVendor(a: db.Actor, draft: QuoteDraftRow): Promise<boolean> {
  if (isAdmin(a)) return true;
  if (!draft.vendor_id || !a.org?.id) return false;
  return (await vendorOrgId(draft.vendor_id)) === a.org.id;
}

/**
 * Load a draft the actor may SEE, or throw. A draft is visible when the actor
 * can see its event (reuses the events repo authorization) or their org is the
 * vendor on the draft. Throws NotFound when absent, Forbidden when off-tenant.
 */
async function loadVisibleDraft(a: db.Actor, id: string): Promise<QuoteDraftRow> {
  const draft = await q1<QuoteDraftRow>(`select * from quote_drafts where id = $1`, [id]);
  if (!draft) throw new NotFoundError("quote draft not found");
  // Event-side access (owner org / client / planner / attached vendor).
  if (draft.event_id) {
    try {
      await getEvent(a, draft.event_id); // throws Forbidden/NotFound if no access
      return draft;
    } catch {
      // fall through to the vendor-side check
    }
  }
  // Vendor-side access.
  if (await actorIsVendor(a, draft)) return draft;
  throw new ForbiddenError("no access to this quote draft");
}

const router = Router();
router.use(requireUser);

/**
 * Generate a draft quote and persist it. Requires an event the actor can see
 * plus a branding opportunity at the chosen venue. Optionally a vendor (whose
 * pricing rules + requirements are read by SQL, never imported from Phase 2).
 */
router.post(
  "/generate",
  h(async (req, res) => {
    const a = await actor(req);
    const {
      event_id,
      venue_id,
      branding_opportunity_id,
      vendor_id,
      service_category,
      requirement_id,
    } = req.body ?? {};
    if (!event_id) return res.status(400).json({ error: "event_id required" });
    if (!branding_opportunity_id) {
      return res.status(400).json({ error: "branding_opportunity_id required" });
    }

    // The actor must be able to see the event (IDOR gate, reuses events repo).
    const ev = await getEvent(a, event_id);
    const venueId: string | null = venue_id ?? ev.venue_id ?? null;
    if (!venueId) {
      return res.status(400).json({ error: "venue_id required (event has no venue)" });
    }

    const prefill = await buildQuotePrefill({
      venueId,
      brandingOpportunityId: branding_opportunity_id,
      serviceCategory: service_category ?? null,
    });
    if (!prefill) {
      return res
        .status(404)
        .json({ error: "branding opportunity not found for this venue" });
    }

    // Read the vendor's pricing rules + requirement by SQL (Phase 2 tables).
    let pricingRules: PricingRules | null = null;
    let baseUnit: string | null = null;
    let resolvedRequirementId: string | null = requirement_id ?? null;
    if (vendor_id) {
      const category = service_category ?? prefill.opportunity.category ?? null;
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
      if (!resolvedRequirementId) {
        const reqRow = await q1<{ id: string }>(
          category
            ? `select id from vendor_quote_requirements
                 where vendor_id = $1 and service_category = $2
                 order by updated_at desc limit 1`
            : `select id from vendor_quote_requirements
                 where vendor_id = $1 order by updated_at desc limit 1`,
          category ? [vendor_id, category] : [vendor_id],
        );
        resolvedRequirementId = reqRow?.id ?? null;
      }
    }

    const draft = assembleDraftQuote({ prefill, pricingRules, baseUnit });

    const row = await q1<QuoteDraftRow>(
      `insert into quote_drafts
         (event_id, venue_id, branding_opportunity_id, vendor_id, requirement_id,
          prefilled, scope_of_work, install_notes, removal_notes, compliance_notes,
          timeline, computed_price, status, created_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'draft',$13)
       returning *`,
      [
        event_id,
        venueId,
        branding_opportunity_id,
        vendor_id ?? null,
        resolvedRequirementId,
        JSON.stringify(draft.prefilled),
        draft.scope_of_work,
        draft.install_notes,
        draft.removal_notes,
        draft.compliance_notes,
        JSON.stringify(draft.timeline),
        draft.computed_price,
        a.user.id,
      ],
    );
    res.status(201).json({ draft: row, pricing: draft.pricing });
  }),
);

/** List drafts the actor can see. Optional ?eventId= narrows to one event. */
router.get(
  "/",
  h(async (req, res) => {
    const a = await actor(req);
    const eventId = typeof req.query.eventId === "string" ? req.query.eventId : null;
    if (eventId) {
      // IDOR gate: confirm the actor can see this event first.
      await getEvent(a, eventId);
      const rows = await q<QuoteDraftRow>(
        `select * from quote_drafts where event_id = $1 order by created_at desc`,
        [eventId],
      );
      return res.json({ drafts: rows });
    }
    if (isAdmin(a)) {
      const rows = await q<QuoteDraftRow>(
        `select * from quote_drafts order by created_at desc limit 500`,
      );
      return res.json({ drafts: rows });
    }
    // Drafts on events the actor's org owns / is client/planner of / is a vendor on,
    // plus drafts where the actor's org is the named vendor.
    const rows = await q<QuoteDraftRow>(
      `select distinct d.*
         from quote_drafts d
         left join events e on e.id = d.event_id
         left join event_vendors ev on ev.event_id = e.id
         left join vendors v on v.id = d.vendor_id
        where ($1::uuid is not null and e.organization_id = $1)
           or e.client_id = $2
           or e.planner_id = $2
           or ($1::uuid is not null and ev.organization_id = $1)
           or ($1::uuid is not null and v.organization_id = $1)
        order by d.created_at desc
        limit 500`,
      [a.org?.id ?? null, a.user.id],
    );
    res.json({ drafts: rows });
  }),
);

/** Get one draft (visibility-gated). */
router.get(
  "/:id",
  h(async (req, res) => {
    const a = await actor(req);
    res.json({ draft: await loadVisibleDraft(a, req.params.id) });
  }),
);

/**
 * Vendor edit: patch scope / notes / price / timeline / status. Only the vendor
 * on the draft (or admin) may edit. Status, when supplied, must be valid.
 */
router.patch(
  "/:id",
  h(async (req, res) => {
    const a = await actor(req);
    const draft = await loadVisibleDraft(a, req.params.id);
    if (!(await actorIsVendor(a, draft))) {
      throw new ForbiddenError("only the vendor on this draft can edit it");
    }
    const b = req.body ?? {};
    if (b.status != null && !VALID_STATUS.has(b.status)) {
      return res.status(400).json({ error: "invalid status" });
    }
    const row = await q1<QuoteDraftRow>(
      `update quote_drafts set
          scope_of_work = coalesce($2, scope_of_work),
          install_notes = coalesce($3, install_notes),
          removal_notes = coalesce($4, removal_notes),
          compliance_notes = coalesce($5, compliance_notes),
          timeline = coalesce($6, timeline),
          computed_price = coalesce($7, computed_price),
          status = coalesce($8, status),
          updated_at = now()
        where id = $1
        returning *`,
      [
        draft.id,
        b.scope_of_work ?? null,
        b.install_notes ?? null,
        b.removal_notes ?? null,
        b.compliance_notes ?? null,
        b.timeline === undefined ? null : JSON.stringify(b.timeline),
        b.computed_price ?? null,
        b.status ?? null,
      ],
    );
    res.json({ draft: row });
  }),
);

/** Vendor approve: move the draft to vendor_approved (vendor only). */
router.post(
  "/:id/approve",
  h(async (req, res) => {
    const a = await actor(req);
    const draft = await loadVisibleDraft(a, req.params.id);
    if (!(await actorIsVendor(a, draft))) {
      throw new ForbiddenError("only the vendor on this draft can approve it");
    }
    const row = await q1<QuoteDraftRow>(
      `update quote_drafts set status = 'vendor_approved', updated_at = now()
        where id = $1 returning *`,
      [draft.id],
    );
    res.json({ draft: row });
  }),
);

/**
 * Client deliver: move an approved draft to client_delivered. The event owner /
 * client / planner side (not the vendor) delivers, so this requires event-side
 * access and an already-approved draft.
 */
router.post(
  "/:id/deliver",
  h(async (req, res) => {
    const a = await actor(req);
    const draft = await loadVisibleDraft(a, req.params.id);
    if (!draft.event_id) throw new ForbiddenError("draft is not attached to an event");
    // Event-side access required (owner org / client / planner / attached vendor).
    await getEvent(a, draft.event_id);
    if (draft.status !== "vendor_approved") {
      return res
        .status(400)
        .json({ error: "draft must be vendor_approved before delivery" });
    }
    const row = await q1<QuoteDraftRow>(
      `update quote_drafts set status = 'client_delivered', updated_at = now()
        where id = $1 returning *`,
      [draft.id],
    );
    res.json({ draft: row });
  }),
);

/** Decline a draft (vendor only). */
router.post(
  "/:id/decline",
  h(async (req, res) => {
    const a = await actor(req);
    const draft = await loadVisibleDraft(a, req.params.id);
    if (!(await actorIsVendor(a, draft))) {
      throw new ForbiddenError("only the vendor on this draft can decline it");
    }
    const row = await q1<QuoteDraftRow>(
      `update quote_drafts set status = 'declined', updated_at = now()
        where id = $1 returning *`,
      [draft.id],
    );
    res.json({ draft: row });
  }),
);

export default router;
