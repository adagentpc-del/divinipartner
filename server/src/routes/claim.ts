/**
 * Claim Your Profile routes. Mount base: /api/claim
 *
 * PUBLIC (no auth):
 *   GET  /profile/:slug      public unclaimed profile JSON (+ unclaimed banner)
 *   POST /removal-request    take a listing down
 *   POST /unsubscribe        stop outreach for an email
 *   POST /verify             start a claim (full name, role, business email)
 *   POST /verify/confirm     confirm a claim (code) and convert to Free Partner
 *
 * ADMIN (requireAdmin):
 *   GET  /admin/metrics                dashboard metrics
 *   GET  /admin/queue                  discovery review queue
 *   GET  /admin/businesses             list discovered businesses
 *   POST /admin/discover               ingest admin-provided rows (enrich + score)
 *   POST /admin/businesses/:id/status  status transition
 *   PATCH /admin/businesses/:id        edit a discovered business
 *   POST /admin/businesses/:id/do-not-contact
 *   POST /admin/businesses/:id/merge   mark as duplicate of another
 *   POST /admin/profiles/:id/approve   publish an unclaimed profile (indexable later)
 *   PATCH /admin/profiles/:id          edit a profile
 *   POST /admin/profiles/:id/archive
 *   POST /admin/profiles/:id/send-email   send the next claim email (stub)
 *   POST /admin/profiles/:id/pause        pause outreach
 *   POST /admin/profiles/:id/manual-approve  admin approve a manual claim
 *   GET  /admin/markets / POST /admin/markets / POST /admin/markets/:id/status
 *   GET  /admin/markets/plan / POST /admin/markets/advance   scheduler controls
 *   GET  /admin/suppression / POST /admin/suppression / DELETE /admin/suppression/:id
 *
 * ZERO em dashes in this file (hard rule).
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { getAuth, requireAdmin } from "../auth.js";
import * as claim from "../db/claim.js";
import * as discovery from "../lib/discovery.js";
import * as discoverySearch from "../lib/discovery-search.js";
import * as emails from "../lib/claim-emails.js";
import * as verify from "../lib/claim-verify.js";
import { validateUrlUpload } from "../lib/uploadGuard.js";
import { rateLimit } from "../lib/rateLimit.js";

/**
 * Tight limiter for the public, token/code-bearing claim endpoints. The generic
 * 300/min API limiter leaves room to brute-force the 6-digit email code or
 * enumerate slugs; 15/min per client IP makes that infeasible while staying well
 * clear of any legitimate claimant. Keyed on the trusted-proxy client IP.
 */
const claimTokenLimit = rateLimit({ windowMs: 60_000, max: 15 });

const h =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch(next);

const router = Router();

function clientIp(req: Request): string | null {
  return (
    (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() ||
    req.socket.remoteAddress ||
    null
  );
}

// ===========================================================================
// PUBLIC
// ===========================================================================

// GET /profile/:slug : public unclaimed profile + banner data.
router.get(
  "/profile/:slug",
  h(async (req, res) => {
    const row = await claim.getPublicUnclaimedBySlug(req.params.slug);
    if (!row) return res.status(404).json({ error: "profile not found" });
    res.json({
      profile: {
        slug: row.profile_slug,
        businessName: row.business.business_name,
        category: row.business.category,
        subcategories: row.business.subcategories,
        city: row.business.city,
        state: row.business.state,
        region: row.business.region,
        country: row.business.country,
        website: row.business.website_url,
        socialLinks: row.business.social_links,
        description: row.ai_generated_description,
        tags: row.ai_generated_tags,
        logoUrl: row.logo_url,
        ownerVerified: false,
      },
      // The page must clearly state this is unclaimed and never imply
      // verified/preferred/partnered status.
      banner: {
        unclaimed: true,
        label: claim.SOURCE_ATTRIBUTION,
        attribution: row.source_attribution ?? claim.SOURCE_ATTRIBUTION,
        verified: false,
        preferred: false,
        partnered: false,
      },
      noindex: row.noindex_status !== false,
    });
  }),
);

// POST /removal-request : take a listing down.
router.post(
  "/removal-request",
  h(async (req, res) => {
    const { slug, email, reason } = req.body ?? {};
    if (!slug || typeof slug !== "string")
      return res.status(400).json({ error: "slug is required" });
    const profile = await claim.getUnclaimedProfileBySlug(slug);
    if (!profile) return res.status(404).json({ error: "profile not found" });
    await claim.markRemovalRequested(slug);
    await claim.stopOutreachForProfile(profile.id, "removal_request");
    if (typeof email === "string" && email.includes("@")) {
      await claim.addSuppression({
        email,
        reason: "removal_request",
        profileId: profile.id,
        sourceIp: clientIp(req),
      });
    }
    if (profile.discovered_business_id) {
      await claim.setDiscoveryStatus(profile.discovered_business_id, "archived", {
        notes: typeof reason === "string" ? `removal: ${reason}` : "removal requested",
      });
    }
    res.json({ ok: true, removed: true });
  }),
);

// POST /unsubscribe : stop outreach for an email.
router.post(
  "/unsubscribe",
  h(async (req, res) => {
    const { email, slug } = req.body ?? {};
    if (!email || typeof email !== "string" || !email.includes("@"))
      return res.status(400).json({ error: "a valid email is required" });
    let profileId: string | null = null;
    if (typeof slug === "string") {
      const profile = await claim.getUnclaimedProfileBySlug(slug);
      if (profile) {
        profileId = profile.id;
        await claim.stopOutreachForProfile(profile.id, "unsubscribe");
      }
    }
    await claim.addSuppression({
      email,
      reason: "unsubscribe",
      profileId,
      sourceIp: clientIp(req),
    });
    res.json({ ok: true, unsubscribed: true });
  }),
);

// POST /verify : start a claim.
router.post(
  "/verify",
  claimTokenLimit,
  h(async (req, res) => {
    const auth = getAuth(req);
    const { slug, fullName, role, businessEmail, agreementAccepted } = req.body ?? {};
    if (!slug || !fullName || !role || !businessEmail)
      return res.status(400).json({ error: "slug, fullName, role, and businessEmail are required" });
    const out = await verify.startClaim({
      slug,
      fullName,
      claimantRole: role,
      businessEmail,
      agreementAccepted: !!agreementAccepted,
      userId: auth.userId,
    });
    if ("error" in out) return res.status(out.status).json({ error: out.error });
    res.json(out);
  }),
);

// POST /verify/confirm : confirm a claim and convert to Free Partner.
router.post(
  "/verify/confirm",
  claimTokenLimit,
  h(async (req, res) => {
    const auth = getAuth(req);
    const { slug, code } = req.body ?? {};
    if (!slug) return res.status(400).json({ error: "slug is required" });
    const out = await verify.confirmClaim({
      slug,
      code: typeof code === "string" ? code : null,
      sub: auth.userId,
      email: auth.email,
    });
    if (!out.ok) return res.status(out.status).json({ error: out.error, pending: out.pending });
    res.json({ ok: true, organizationId: out.organizationId, slug: out.slug });
  }),
);

// ===========================================================================
// ADMIN
// ===========================================================================

router.get(
  "/admin/metrics",
  requireAdmin,
  h(async (_req, res) => {
    res.json({ metrics: await claim.getClaimMetrics() });
  }),
);

router.get(
  "/admin/queue",
  requireAdmin,
  h(async (_req, res) => {
    const businesses = await claim.listDiscoveredBusinesses({ status: "discovered", limit: 200 });
    res.json({ businesses });
  }),
);

router.get(
  "/admin/businesses",
  requireAdmin,
  h(async (req, res) => {
    const status = req.query.status as claim.DiscoveryStatus | undefined;
    const category = req.query.category as string | undefined;
    const region = req.query.region as string | undefined;
    const businesses = await claim.listDiscoveredBusinesses({ status, category, region, limit: 300 });
    res.json({ businesses });
  }),
);

// POST /admin/discover : ingest admin-provided rows (enrich + score + create).
router.post(
  "/admin/discover",
  requireAdmin,
  h(async (req, res) => {
    const body = req.body ?? {};
    const rows: discovery.BusinessInput[] = Array.isArray(body.rows)
      ? body.rows
      : body.row
        ? [body.row]
        : [];
    if (!rows.length) return res.status(400).json({ error: "rows[] is required" });
    const clean = rows
      .filter((r) => r && typeof r.businessName === "string" && r.businessName.trim())
      .map((r) => ({
        businessName: r.businessName.trim(),
        websiteUrl: r.websiteUrl ?? null,
        city: r.city ?? null,
        state: r.state ?? null,
        region: r.region ?? null,
        country: r.country ?? null,
        category: r.category ?? null,
        subcategories: r.subcategories ?? null,
        publicEmail: r.publicEmail ?? null,
        publicPhone: r.publicPhone ?? null,
        address: r.address ?? null,
        socialLinks: r.socialLinks ?? null,
        sourceUrls: r.sourceUrls ?? null,
      }));
    const result = await discovery.ingestMany(clean, {
      marketId: typeof body.marketId === "string" ? body.marketId : null,
    });
    res.status(201).json(result);
  }),
);

// POST /admin/discover/search : autonomous local-first discovery search.
// Searches a self-hosted provider (SearXNG) for businesses by category +
// location, structures candidate rows with the local LLM (no fabricated
// pricing/availability/capacity/insurance/emails), then feeds them through the
// SAME ingest as /admin/discover (scoring, dedupe, profile creation). Returns a
// summary { found, ingested, summary, outcomes }. When search is not configured,
// found is 0 and nothing is ingested.
router.post(
  "/admin/discover/search",
  requireAdmin,
  h(async (req, res) => {
    const body = req.body ?? {};
    const category = typeof body.category === "string" ? body.category.trim() : "";
    if (!category) return res.status(400).json({ error: "category is required" });
    const city = typeof body.city === "string" ? body.city.trim() : undefined;
    const state = typeof body.state === "string" ? body.state.trim() : undefined;
    const limit = typeof body.limit === "number" ? body.limit : undefined;

    const found = await discoverySearch.searchBusinesses({ category, city, state, limit });
    if (!found.length) {
      return res.json({
        found: 0,
        ingested: 0,
        summary: { total: 0, created: 0, duplicate: 0, below_threshold: 0, rejected: 0 },
        outcomes: [],
      });
    }

    const rows: discovery.BusinessInput[] = found.map((r) => ({
      businessName: r.business_name,
      websiteUrl: r.website_url ?? null,
      city: r.city ?? null,
      state: r.state ?? null,
      region: null,
      country: null,
      category: r.category ?? category,
      subcategories: null,
      publicEmail: r.public_email ?? null,
      publicPhone: null,
      address: null,
      socialLinks: null,
      sourceUrls: r.source_urls ?? null,
    }));

    const result = await discovery.ingestMany(rows, {
      marketId: typeof body.marketId === "string" ? body.marketId : null,
    });
    res.status(201).json({
      found: found.length,
      ingested: result.summary.created ?? 0,
      summary: result.summary,
      outcomes: result.outcomes,
    });
  }),
);

router.post(
  "/admin/businesses/:id/status",
  requireAdmin,
  h(async (req, res) => {
    const { status, notes } = req.body ?? {};
    if (!status || !claim.DISCOVERY_STATUSES.includes(status))
      return res.status(400).json({ error: "valid status required" });
    const row = await claim.setDiscoveryStatus(req.params.id, status, { notes });
    if (!row) return res.status(404).json({ error: "not found" });
    res.json({ business: row });
  }),
);

router.patch(
  "/admin/businesses/:id",
  requireAdmin,
  h(async (req, res) => {
    const b = req.body ?? {};
    const patch: Record<string, unknown> = {};
    for (const k of [
      "business_name",
      "category",
      "subcategories",
      "website_url",
      "public_email",
      "public_phone",
      "city",
      "state",
      "region",
      "notes",
    ]) {
      if (b[k] !== undefined) patch[k] = b[k];
    }
    const row = await claim.editDiscoveredBusiness(req.params.id, patch);
    if (!row) return res.status(404).json({ error: "not found" });
    res.json({ business: row });
  }),
);

router.post(
  "/admin/businesses/:id/do-not-contact",
  requireAdmin,
  h(async (req, res) => {
    const row = await claim.setDiscoveryStatus(req.params.id, "do_not_contact");
    if (!row) return res.status(404).json({ error: "not found" });
    if (row.public_email) {
      await claim.addSuppression({ email: row.public_email, reason: "do_not_contact" });
    }
    res.json({ business: row });
  }),
);

router.post(
  "/admin/businesses/:id/merge",
  requireAdmin,
  h(async (req, res) => {
    const { duplicateOf, reason } = req.body ?? {};
    if (!duplicateOf) return res.status(400).json({ error: "duplicateOf is required" });
    const row = await claim.setDiscoveryStatus(req.params.id, "rejected", {
      duplicateOf,
      duplicateReason: typeof reason === "string" ? reason : "merged duplicate",
    });
    if (!row) return res.status(404).json({ error: "not found" });
    res.json({ business: row });
  }),
);

router.patch(
  "/admin/profiles/:id",
  requireAdmin,
  h(async (req, res) => {
    const b = req.body ?? {};
    const patch: Record<string, unknown> = {};
    if (b.description !== undefined) patch.ai_generated_description = b.description;
    if (Array.isArray(b.tags)) patch.ai_generated_tags = b.tags;
    if (b.logoUrl !== undefined) {
      if (typeof b.logoUrl === "string" && b.logoUrl.trim()) {
        const check = validateUrlUpload(b.logoUrl.trim(), { allow: "images" });
        if (!check.ok) return res.status(400).json({ error: `logoUrl: ${check.reason}` });
      }
      patch.logo_url = b.logoUrl;
    }
    if (b.noindex !== undefined) patch.noindex_status = !!b.noindex;
    const row = await claim.editUnclaimedProfile(req.params.id, patch);
    if (!row) return res.status(404).json({ error: "not found" });
    res.json({ profile: row });
  }),
);

router.post(
  "/admin/profiles/:id/approve",
  requireAdmin,
  h(async (req, res) => {
    const row = await claim.editUnclaimedProfile(req.params.id, { published_status: "unclaimed" });
    if (!row) return res.status(404).json({ error: "not found" });
    res.json({ profile: row, approved: true });
  }),
);

router.post(
  "/admin/profiles/:id/archive",
  requireAdmin,
  h(async (req, res) => {
    const row = await claim.archiveProfile(req.params.id);
    if (!row) return res.status(404).json({ error: "not found" });
    await claim.stopOutreachForProfile(req.params.id, "archived");
    res.json({ profile: row, archived: true });
  }),
);

// POST /admin/profiles/:id/send-email : send the next claim email (stub).
router.post(
  "/admin/profiles/:id/send-email",
  requireAdmin,
  h(async (req, res) => {
    const profile = await claim.getUnclaimedProfile(req.params.id);
    if (!profile) return res.status(404).json({ error: "not found" });
    const business = profile.discovered_business_id
      ? await claim.getDiscoveredBusiness(profile.discovered_business_id)
      : null;
    const to = business?.public_email;
    if (!to) return res.status(400).json({ error: "no public email on file for this business" });
    const result = await emails.send(profile.id, {
      businessName: business?.business_name ?? "your business",
      city: business?.city ?? null,
      category: business?.category ?? null,
      slug: profile.profile_slug ?? "",
      email: to,
    });
    if (!result.sent) return res.status(409).json({ error: result.reason, sent: false });
    res.json({
      sent: true,
      step: result.outreach?.sequence_step,
      cadence: result.outreach?.cadence,
      preview: { subject: result.email?.subject, body: result.email?.body },
    });
  }),
);

router.post(
  "/admin/profiles/:id/pause",
  requireAdmin,
  h(async (req, res) => {
    await claim.stopOutreachForProfile(req.params.id, "paused_by_admin");
    res.json({ ok: true, paused: true });
  }),
);

router.post(
  "/admin/profiles/:id/manual-approve",
  requireAdmin,
  h(async (req, res) => {
    const auth = getAuth(req);
    const profile = await claim.getUnclaimedProfile(req.params.id);
    if (!profile) return res.status(404).json({ error: "not found" });
    const { ownerSub, ownerEmail } = req.body ?? {};
    if (!ownerSub) return res.status(400).json({ error: "ownerSub is required" });
    const out = await verify.adminApproveClaim({
      slug: profile.profile_slug ?? "",
      adminUserId: auth.userId!,
      ownerSub,
      ownerEmail: typeof ownerEmail === "string" ? ownerEmail : null,
    });
    if (!out.ok) return res.status(out.status).json({ error: out.error });
    res.json({ ok: true, organizationId: out.organizationId });
  }),
);

// ---- Markets + scheduler ---------------------------------------------------

router.get(
  "/admin/markets",
  requireAdmin,
  h(async (_req, res) => {
    res.json({ markets: await claim.listMarkets() });
  }),
);

router.post(
  "/admin/markets",
  requireAdmin,
  h(async (req, res) => {
    const b = req.body ?? {};
    if (!b.marketName) return res.status(400).json({ error: "marketName is required" });
    const market = await claim.upsertMarket({
      marketName: b.marketName,
      state: b.state ?? null,
      region: b.region ?? null,
      status: b.status ?? "queued",
      targetCategories: Array.isArray(b.targetCategories) ? b.targetCategories : null,
      maxProfiles: typeof b.maxProfiles === "number" ? b.maxProfiles : null,
      outreachCadence: b.outreachCadence ?? null,
      priority: typeof b.priority === "number" ? b.priority : null,
    });
    res.status(201).json({ market });
  }),
);

router.post(
  "/admin/markets/:id/status",
  requireAdmin,
  h(async (req, res) => {
    const { status } = req.body ?? {};
    if (!status) return res.status(400).json({ error: "status is required" });
    const market = await claim.setMarketStatus(req.params.id, status);
    if (!market) return res.status(404).json({ error: "not found" });
    res.json({ market });
  }),
);

// GET /admin/markets/plan : pure expansion planner (admin can step it).
router.get(
  "/admin/markets/plan",
  requireAdmin,
  h(async (_req, res) => {
    const markets = await claim.listMarkets();
    res.json({ plan: discovery.planExpansion(markets) });
  }),
);

// POST /admin/markets/advance : open the next planned market per the rollout.
router.post(
  "/admin/markets/advance",
  requireAdmin,
  h(async (req, res) => {
    const markets = await claim.listMarkets();
    const plan = discovery.planExpansion(markets);
    if ((plan.action === "hold" || plan.action === "complete") || !plan.next)
      return res.json({ plan, opened: null });
    const b = req.body ?? {};
    const market = await claim.upsertMarket({
      marketName: plan.next.marketName,
      state: plan.next.state,
      region: plan.next.region,
      status: "active",
      targetCategories: Array.isArray(b.targetCategories) ? b.targetCategories : null,
      maxProfiles: typeof b.maxProfiles === "number" ? b.maxProfiles : 100,
      priority: markets.length + 1,
    });
    res.status(201).json({ plan, opened: market });
  }),
);

// ---- Suppression management ------------------------------------------------

router.get(
  "/admin/suppression",
  requireAdmin,
  h(async (_req, res) => {
    res.json({ suppression: await claim.listSuppression() });
  }),
);

router.post(
  "/admin/suppression",
  requireAdmin,
  h(async (req, res) => {
    const { email, domain, reason } = req.body ?? {};
    if (!email && !domain) return res.status(400).json({ error: "email or domain is required" });
    const row = await claim.addSuppression({
      email: typeof email === "string" ? email : null,
      domain: typeof domain === "string" ? domain : null,
      reason: ["unsubscribe", "removal_request", "do_not_contact", "bounce", "manual"].includes(reason)
        ? reason
        : "manual",
    });
    res.status(201).json({ suppression: row });
  }),
);

router.delete(
  "/admin/suppression/:id",
  requireAdmin,
  h(async (req, res) => {
    await claim.removeSuppression(req.params.id);
    res.status(204).end();
  }),
);

export default router;
