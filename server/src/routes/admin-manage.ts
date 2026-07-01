/**
 * Admin manual management routes. Mount base: /api/admin/manage.
 *
 * Lets an admin hand-create venue/vendor listings (a discovered_business plus an
 * unclaimed_profile), optionally fire the claim invitation email, look up and
 * re-invite existing listings, and create/list events directly. ALL routes are
 * requireAdmin. Mirrors routes/admin.ts: the h() wrapper, actor(req), ip(req),
 * and logAction audit usage.
 *
 * Zero em dashes in this file.
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { getAuth, requireAdmin } from "../auth.js";
import * as db from "../db.js";
import * as claim from "../db/claim.js";
import * as events from "../db/events.js";
import * as emails from "../lib/claim-emails.js";
import { sendEmail } from "../lib/email.js";
import { logAction } from "../lib/audit.js";
import { q } from "../pool.js";
import { extractProfileFromUrl } from "../lib/extract.js";
import { llmEnabled } from "../lib/llm.js";

const h =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch(next);

async function actor(req: Request): Promise<db.Actor> {
  const auth = getAuth(req);
  return db.getActor(auth.userId!, auth.email);
}
function ip(req: Request): string | null {
  return (
    (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() ||
    req.socket.remoteAddress ||
    null
  );
}

/** Lowercased, hyphenated slug from a name plus a short random suffix. */
function makeSlug(name: string): string {
  const base = (name || "listing")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "listing";
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${base}-${suffix}`;
}

const router = Router();
router.use(requireAdmin);

// ---- Listings --------------------------------------------------------------

// POST /listings : create a venue/vendor unclaimed listing, optionally invite.
router.post(
  "/listings",
  h(async (req, res) => {
    const a = await actor(req);
    const {
      kind,
      businessName,
      category,
      contactEmail,
      creatorEmail,
      city,
      state,
      region,
      website,
      description,
      invite,
    } = req.body ?? {};

    if (!["venue", "vendor", "client", "planner"].includes(kind)) {
      return res.status(400).json({ error: "kind must be venue, vendor, client, or planner" });
    }
    if (!businessName || typeof businessName !== "string") {
      return res.status(400).json({ error: "businessName required" });
    }
    if (!contactEmail || typeof contactEmail !== "string") {
      return res.status(400).json({ error: "contactEmail required" });
    }

    const biz = await claim.insertDiscoveredBusiness({
      businessName,
      category: category || kind,
      publicEmail: contactEmail,
      city: city ?? null,
      state: state ?? null,
      region: region ?? null,
      websiteUrl: website ?? null,
      discoveryStatus: "unclaimed",
    });

    const slug = makeSlug(businessName);
    const profileDescription =
      typeof description === "string" && description.trim().length > 0
        ? description.trim().slice(0, 4000)
        : `${businessName}`;
    const profile = await claim.createUnclaimedProfile({
      discoveredBusinessId: biz.id,
      slug,
      description: profileDescription,
      tags: [kind],
      noindex: true,
    });

    await logAction(
      a,
      "admin.created_listing",
      "unclaimed_profile",
      profile.id,
      null,
      { kind, creatorEmail: creatorEmail ?? null },
      { ip: ip(req), summary: `created ${kind} ${businessName}` },
    );

    let invited = false;
    let inviteError: string | undefined;
    if (invite && contactEmail) {
      try {
        const result = await emails.send(profile.id, {
          businessName,
          city: city ?? null,
          category: category || kind,
          slug: profile.profile_slug ?? slug,
          email: contactEmail,
        });
        invited = !!result.sent;
        if (!result.sent) inviteError = result.reason;
      } catch (e) {
        invited = false;
        inviteError = (e as Error).message;
      }
    }

    if (creatorEmail) {
      await sendEmail({
        to: creatorEmail,
        subject: `You created a ${kind} listing on Divini Partners`,
        html: `<p>You created the listing <b>${businessName}</b>. An invitation to claim it was sent to ${contactEmail}.</p>`,
      }).catch(() => {});
    }

    res.json({
      profile: { id: profile.id, slug: profile.profile_slug ?? slug },
      claimUrl: `/claim/${profile.profile_slug ?? slug}`,
      invited,
      ...(inviteError ? { inviteError } : {}),
    });
  }),
);

// POST /extract : pull a public profile draft from a website URL using the
// local-model extractor. Returns suggestions for the admin to edit. Never a hard
// dependency: when the local LLM is off or extraction fails it returns
// available:false and the admin writes the fields manually.
router.post(
  "/extract",
  h(async (req, res) => {
    const { url } = req.body ?? {};
    if (!url || typeof url !== "string") {
      return res.status(400).json({ error: "url required" });
    }
    if (!llmEnabled()) {
      return res.json({ available: false, name: null, description: null, services: [], tags: [] });
    }
    const out = await extractProfileFromUrl(url);
    if (!out) {
      return res.json({ available: false, name: null, description: null, services: [], tags: [] });
    }
    res.json({
      available: true,
      name: out.name ?? null,
      description: out.description ?? null,
      services: out.services ?? [],
      tags: out.tags ?? [],
    });
  }),
);

// GET /listings?kind=venue|vendor : discovered businesses + their profiles.
router.get(
  "/listings",
  h(async (req, res) => {
    const kind = (req.query.kind as string) || undefined;
    const params: unknown[] = [];
    let where = "";
    if (kind) {
      params.push(kind);
      where = `where b.category = $${params.length}`;
    }
    const listings = await q(
      `select b.id,
              b.business_name,
              b.category,
              b.public_email,
              b.city,
              b.state,
              b.region,
              b.discovery_status,
              p.id as profile_id,
              p.profile_slug,
              p.claim_status,
              (select aa.commission_rate from account_agreements aa
                 where aa.unclaimed_profile_id = p.id and aa.status = 'active'
                 order by aa.created_at desc limit 1) as agreement_rate,
              (select aa.agreement_type from account_agreements aa
                 where aa.unclaimed_profile_id = p.id and aa.status = 'active'
                 order by aa.created_at desc limit 1) as agreement_type,
              b.created_at
         from discovered_businesses b
         left join unclaimed_profiles p on p.discovered_business_id = b.id
         ${where}
         order by b.created_at desc
         limit 200`,
      params,
    );
    res.json({ listings });
  }),
);

// POST /listings/:profileId/invite : send the next claim email for a profile.
router.post(
  "/listings/:profileId/invite",
  h(async (req, res) => {
    const profile = await claim.getUnclaimedProfile(req.params.profileId);
    if (!profile) return res.status(404).json({ error: "not found" });
    const business = profile.discovered_business_id
      ? await claim.getDiscoveredBusiness(profile.discovered_business_id)
      : null;
    const to = business?.public_email;
    if (!to) {
      return res.status(400).json({ error: "no public email on file for this business" });
    }
    const result = await emails.send(profile.id, {
      businessName: business?.business_name ?? "your business",
      city: business?.city ?? null,
      category: business?.category ?? null,
      slug: profile.profile_slug ?? "",
      email: to,
    });
    if (!result.sent) return res.status(409).json({ sent: false, error: result.reason });
    res.json({
      sent: true,
      preview: { subject: result.email?.subject, body: result.email?.body },
    });
  }),
);

// ---- Events ----------------------------------------------------------------

// POST /events : create an event as the admin actor.
router.post(
  "/events",
  h(async (req, res) => {
    const a = await actor(req);
    const { name, type, date_time, guest_count, budget, venue_id } = req.body ?? {};
    if (!name || typeof name !== "string") return res.status(400).json({ error: "name required" });
    const event = await events.createEvent(a, {
      name,
      type: type ?? null,
      date_time: date_time ?? null,
      guest_count: guest_count ?? null,
      budget: budget ?? null,
      venue_id: venue_id ?? null,
    });
    res.json({ event });
  }),
);

// GET /events : list events newest first.
router.get(
  "/events",
  h(async (_req, res) => {
    const rows = await q(
      `select id, name, type, status, venue_id, date_time, guest_count, budget, created_at
         from events order by created_at desc limit 200`,
    );
    res.json({ events: rows });
  }),
);

// ---- Account agreements ----------------------------------------------------
// Attach a bespoke partnership / commission deal to a specific account (org)
// or a not-yet-claimed listing (unclaimed profile, e.g. A3). Records + attaches
// only; it never moves money.

const RATE_OK = (v: unknown): number | null => {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 && n <= 100 ? n : NaN;
};

const numOrNull = (v: unknown): number | null =>
  v === undefined || v === null || v === "" ? null : Number(v);

// Client Total (cents) = partner price + Divini margin% + kickback (percent of
// partner price, or flat dollars). Pure read-time computation; nothing stored.
function clientTotalCents(r: Record<string, unknown>): number {
  const base = Number(r.partner_price_cents) || 0;
  const margin = Number(r.commission_rate) || 0;
  const marginCents = Math.round((base * margin) / 100);
  const kv = Number(r.kickback_value) || 0;
  let kbCents = 0;
  if (r.kickback_type === "percent") kbCents = Math.round((base * kv) / 100);
  else if (r.kickback_type === "flat") kbCents = Math.round(kv * 100);
  return base + marginCents + kbCents;
}
const withTotal = (r: Record<string, unknown>) => ({ ...r, client_total_cents: clientTotalCents(r) });

router.post(
  "/agreements",
  h(async (req, res) => {
    const a = await actor(req);
    const auth = getAuth(req);
    const {
      profileId, organizationId, subjectKind, agreementType, commissionRate, appliesTo, terms, docUrl,
      contractingEntity, partnerPriceCents, kickbackType, kickbackValue, assignedVendorProfileId, assignedVendorName,
    } = req.body ?? {};
    if (!agreementType || typeof agreementType !== "string")
      return res.status(400).json({ error: "agreementType required" });
    if (!profileId && !organizationId)
      return res.status(400).json({ error: "profileId or organizationId required" });
    if (docUrl && !/^https?:\/\//i.test(String(docUrl)))
      return res.status(400).json({ error: "docUrl must be a valid http(s) link" });
    const rate = RATE_OK(commissionRate);
    if (Number.isNaN(rate)) return res.status(400).json({ error: "commissionRate must be 0 to 100" });
    const kb = kickbackType === "percent" || kickbackType === "flat" ? kickbackType : null;
    const rows = await q(
      `insert into account_agreements
         (organization_id, unclaimed_profile_id, subject_kind, agreement_type,
          commission_rate, applies_to, terms, doc_url, created_by_email,
          contracting_entity, partner_price_cents, kickback_type, kickback_value,
          assigned_vendor_profile_id, assigned_vendor_name, assigned_vendor_status)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
       returning *`,
      [
        organizationId ?? null,
        profileId ?? null,
        subjectKind ?? null,
        agreementType,
        rate,
        appliesTo ?? null,
        terms ?? null,
        docUrl ?? null,
        auth.email ?? null,
        contractingEntity ?? "Divini Partners",
        partnerPriceCents != null && partnerPriceCents !== "" ? Math.round(Number(partnerPriceCents)) : null,
        kb,
        numOrNull(kickbackValue),
        assignedVendorProfileId ?? null,
        assignedVendorName ?? null,
        assignedVendorProfileId || assignedVendorName ? "assigned" : "unassigned",
      ],
    );
    await logAction(
      a,
      "admin.attached_agreement",
      organizationId ? "organization" : "unclaimed_profile",
      (organizationId ?? profileId) as string,
      null,
      { agreementType, commissionRate: rate, appliesTo: appliesTo ?? null },
      { ip: ip(req), summary: `attached ${agreementType} ${rate ?? "?"}%` },
    );
    res.json({ agreement: rows[0] });
  }),
);

router.get(
  "/agreements",
  h(async (req, res) => {
    const profileId = (req.query.profileId as string) || undefined;
    const organizationId = (req.query.organizationId as string) || undefined;
    const params: unknown[] = [];
    let where = "where 1=1";
    if (profileId) {
      params.push(profileId);
      where += ` and a.unclaimed_profile_id = $${params.length}`;
    }
    if (organizationId) {
      params.push(organizationId);
      where += ` and a.organization_id = $${params.length}`;
    }
    const rows = await q(
      `select a.*, coalesce(o.name, db2.business_name) as subject_name
         from account_agreements a
         left join organizations o on o.id = a.organization_id
         left join unclaimed_profiles up on up.id = a.unclaimed_profile_id
         left join discovered_businesses db2 on db2.id = up.discovered_business_id
         ${where}
         order by a.created_at desc
         limit 200`,
      params,
    );
    res.json({ agreements: (rows as Record<string, unknown>[]).map(withTotal) });
  }),
);

router.patch(
  "/agreements/:id",
  h(async (req, res) => {
    const a = await actor(req);
    const {
      commissionRate, agreementType, appliesTo, terms, docUrl, status,
      contractingEntity, partnerPriceCents, kickbackType, kickbackValue,
    } = req.body ?? {};
    const sets: string[] = [];
    const params: unknown[] = [];
    const add = (col: string, val: unknown) => {
      params.push(val);
      sets.push(`${col} = $${params.length}`);
    };
    if (agreementType !== undefined) add("agreement_type", agreementType);
    if (commissionRate !== undefined) {
      const rate = RATE_OK(commissionRate);
      if (Number.isNaN(rate)) return res.status(400).json({ error: "commissionRate must be 0 to 100" });
      add("commission_rate", rate);
    }
    if (appliesTo !== undefined) add("applies_to", appliesTo);
    if (terms !== undefined) add("terms", terms);
    if (docUrl !== undefined) {
      if (docUrl && !/^https?:\/\//i.test(String(docUrl)))
        return res.status(400).json({ error: "docUrl must be a valid http(s) link" });
      add("doc_url", docUrl);
    }
    if (status !== undefined) add("status", status);
    if (contractingEntity !== undefined) add("contracting_entity", contractingEntity);
    if (partnerPriceCents !== undefined)
      add("partner_price_cents", partnerPriceCents === null || partnerPriceCents === "" ? null : Math.round(Number(partnerPriceCents)));
    if (kickbackType !== undefined)
      add("kickback_type", kickbackType === "percent" || kickbackType === "flat" ? kickbackType : null);
    if (kickbackValue !== undefined) add("kickback_value", numOrNull(kickbackValue));
    if (!sets.length) return res.status(400).json({ error: "no fields to update" });
    params.push(req.params.id);
    const rows = await q(
      `update account_agreements set ${sets.join(", ")}, updated_at = now()
        where id = $${params.length} returning *`,
      params,
    );
    if (!rows.length) return res.status(404).json({ error: "not found" });
    await logAction(a, "admin.updated_agreement", "account_agreement", req.params.id, null,
      { fields: sets.length }, { ip: ip(req) });
    res.json({ agreement: rows[0] });
  }),
);

// Assign (or reassign) the fulfilling vendor for an agreement.
router.post(
  "/agreements/:id/assign-vendor",
  h(async (req, res) => {
    const a = await actor(req);
    const { profileId, name } = req.body ?? {};
    if (!profileId && !name) return res.status(400).json({ error: "profileId or name required" });
    const rows = await q(
      `update account_agreements
          set assigned_vendor_profile_id = $1, assigned_vendor_name = $2,
              assigned_vendor_status = 'assigned', assigned_vendor_removed_reason = null,
              updated_at = now()
        where id = $3 returning *`,
      [profileId ?? null, name ?? null, req.params.id],
    );
    if (!rows.length) return res.status(404).json({ error: "not found" });
    await logAction(a, "admin.assigned_vendor", "account_agreement", req.params.id, null,
      { profileId: profileId ?? null, name: name ?? null }, { ip: ip(req), summary: `assigned vendor ${name ?? profileId}` });
    res.json({ agreement: withTotal((rows as Record<string, unknown>[])[0]) });
  }),
);

// Remove the assigned vendor for cause (breach, circumvention, performance, etc.).
router.post(
  "/agreements/:id/remove-vendor",
  h(async (req, res) => {
    const a = await actor(req);
    const { reason } = req.body ?? {};
    const rows = await q(
      `update account_agreements
          set assigned_vendor_status = 'removed', assigned_vendor_removed_reason = $1, updated_at = now()
        where id = $2 returning *`,
      [reason ?? "unspecified", req.params.id],
    );
    if (!rows.length) return res.status(404).json({ error: "not found" });
    await logAction(a, "admin.removed_vendor", "account_agreement", req.params.id, null,
      { reason: reason ?? "unspecified" }, { ip: ip(req), summary: `removed assigned vendor (${reason ?? "unspecified"})` });
    res.json({ agreement: withTotal((rows as Record<string, unknown>[])[0]) });
  }),
);

// Auto-sign and save the agreement to the account (Divini side execution).
router.post(
  "/agreements/:id/sign",
  h(async (req, res) => {
    const a = await actor(req);
    const auth = getAuth(req);
    const rows = await q(
      `update account_agreements
          set signed_status = 'signed', signed_at = now(), signed_by = $1, updated_at = now()
        where id = $2 returning *`,
      [auth.email ?? "Divini Group", req.params.id],
    );
    if (!rows.length) return res.status(404).json({ error: "not found" });
    await logAction(a, "admin.signed_agreement", "account_agreement", req.params.id, null,
      { signed_by: auth.email ?? null }, { ip: ip(req), summary: "auto-signed agreement (Divini)" });
    res.json({ agreement: withTotal((rows as Record<string, unknown>[])[0]) });
  }),
);

export default router;
