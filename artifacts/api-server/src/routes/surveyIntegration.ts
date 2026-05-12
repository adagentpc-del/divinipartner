/**
 * Venue Asset Survey integration routes (Task #5).
 *
 * Three surfaces:
 *   1. PUBLIC webhook  — POST /api/public/integrations/asset-survey/:partnerSlug
 *      (canonical path published to the external Venue Asset Survey app;
 *       the legacy "asset-survey/webhook" name from the original task spec
 *       is intentionally NOT exposed — partner slug is required for routing.)
 *      The external Venue Asset Survey app pushes ingestions here. Each call is
 *      authenticated by an HMAC-SHA256 signature in the `X-Survey-Signature`
 *      header keyed by the per-partner webhook secret. NO Clerk session.
 *   2. ADMIN pull     — POST /admin/integrations/asset-survey/pull/:partnerId
 *      Admin can re-pull the partner's full asset list on demand. Uses the
 *      stored apiKey + apiBaseUrl. Full Clerk auth.
 *   3. ADMIN review   — list/approve/reject survey assets, manage materials
 *      and per-partner integration config. Full Clerk auth.
 *
 * The PUBLIC PROJECTION used to render survey assets on the partner portal
 * lives here too (`buildPublicSurveyAssets`) — it strips every internal /
 * A3-only field so internal photos, NetSuite numbers, surveyor names, install
 * notes etc. can NEVER leak through any /public/* response.
 */
import { Router, type IRouter } from "express";
import { eq, and, desc, sql, inArray } from "drizzle-orm";
import crypto from "node:crypto";
import {
  db,
  partnersTable,
  surveyAssetsTable,
  partnerIntegrationsTable,
  partnerAddonsTable,
  approvedMaterialsTable,
  toPublicSurveyAsset,
  SURVEY_APPROVAL_STATUSES,
  SURVEY_MATERIAL_MODES,
  DEFAULT_APPROVED_MATERIALS,
  type SurveyAsset,
} from "@workspace/db";
import { z } from "zod";
import { getAuth } from "@clerk/express";
import {
  PullSurveyAssetsResponse,
  ListAdminSurveyAssetsResponse,
  GetAdminSurveyAssetResponse,
  UpdateAdminSurveyAssetResponse,
  DeleteAdminSurveyAssetResponse,
  ListApprovedMaterialsResponse,
  UpdateApprovedMaterialResponse,
  DeleteApprovedMaterialResponse,
  GetPartnerSurveyIntegrationResponse,
  UpsertPartnerSurveyIntegrationResponse,
  SurveyTestConnectionResponse,
} from "@workspace/api-zod";
import { sendValidated } from "../lib/validateResponse";
import { objectStorageClient, parseObjectPath } from "../lib/objectStorage";
import dns from "node:dns/promises";
import net from "node:net";

/**
 * SSRF guard: reject hostnames whose resolved IPs hit private / loopback /
 * link-local / cloud-metadata ranges. Without this, an attacker controlling
 * the survey webhook payload could trick our server into fetching internal
 * services (`http://169.254.169.254/...`, `http://10.x.x.x/...`) and storing
 * the response in our public bucket.
 */
function isBlockedIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    if (a === 10) return true;                                  // RFC1918
    if (a === 127) return true;                                 // loopback
    if (a === 0) return true;                                   // unspecified
    if (a === 169 && b === 254) return true;                    // link-local + AWS metadata
    if (a === 172 && b >= 16 && b <= 31) return true;           // RFC1918
    if (a === 192 && b === 168) return true;                    // RFC1918
    if (a >= 224) return true;                                  // multicast / reserved
    return false;
  }
  if (net.isIPv6(ip)) {
    const lc = ip.toLowerCase();
    if (lc === "::1" || lc === "::") return true;
    if (lc.startsWith("fc") || lc.startsWith("fd")) return true; // unique-local
    if (lc.startsWith("fe80")) return true;                      // link-local
    if (lc.startsWith("::ffff:")) return isBlockedIp(lc.slice(7));
    return false;
  }
  return true;
}

async function isHostSafe(hostname: string): Promise<boolean> {
  if (net.isIP(hostname)) return !isBlockedIp(hostname);
  if (hostname === "localhost") return false;
  // Optional explicit allowlist — when set, ONLY these hosts may be mirrored.
  const allowlist = (process.env.SURVEY_MIRROR_ALLOWLIST || "")
    .split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
  if (allowlist.length && !allowlist.includes(hostname.toLowerCase())) return false;
  try {
    const addrs = await dns.lookup(hostname, { all: true });
    return addrs.length > 0 && addrs.every(a => !isBlockedIp(a.address));
  } catch {
    return false;
  }
}

/**
 * Mirror an external image URL into our own object storage so the partner
 * portal never serves photos directly from the survey app's domain. Hardened
 * against SSRF: https-only, no redirects followed, public-IP-only resolution,
 * 10 s timeout, 10 MB cap, image/* content-type only. Already-mirrored URLs
 * are returned untouched. Returns null on any failure so callers can drop
 * the photo rather than leak an external dependency into the public portal.
 */
async function mirrorExternalImage(externalUrl: string | null | undefined): Promise<string | null> {
  if (!externalUrl) return null;
  if (externalUrl.startsWith("/api/storage/public-objects/") || externalUrl.startsWith("/storage/public-objects/")) {
    return externalUrl;
  }
  const searchPaths = (process.env.PUBLIC_OBJECT_SEARCH_PATHS || "").split(",").map(s => s.trim()).filter(Boolean);
  if (!searchPaths.length) return null;
  let parsed: URL;
  try { parsed = new URL(externalUrl); } catch { return null; }
  if (parsed.protocol !== "https:") return null;
  if (!(await isHostSafe(parsed.hostname))) return null;
  try {
    const r = await fetch(externalUrl, {
      signal: AbortSignal.timeout(10_000),
      redirect: "error",
    });
    if (!r.ok) return null;
    const ct = r.headers.get("content-type") || "application/octet-stream";
    if (!ct.startsWith("image/")) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > 10 * 1024 * 1024) return null;
    const ext = ct.split("/")[1]?.split(";")[0]?.replace(/[^a-z0-9]/gi, "") || "bin";
    const key = `survey-assets/${crypto.randomUUID()}.${ext}`;
    const fullPath = `${searchPaths[0]}/${key}`;
    const { bucketName, objectName } = parseObjectPath(fullPath);
    await objectStorageClient.bucket(bucketName).file(objectName).save(buf, {
      contentType: ct, resumable: false,
    });
    return `/api/storage/public-objects/${key}`;
  } catch {
    return null;
  }
}

async function mirrorPhotoArray(photos: Array<{ url: string; caption?: string }> | null | undefined): Promise<Array<{ url: string; caption?: string }> | null> {
  if (!photos?.length) return null;
  const mirrored = await Promise.all(photos.map(async p => {
    const url = await mirrorExternalImage(p.url);
    return url ? { url, caption: p.caption } : null;
  }));
  const kept: Array<{ url: string; caption?: string }> = [];
  for (const m of mirrored) if (m) kept.push({ url: m.url, ...(m.caption !== undefined && { caption: m.caption }) });
  return kept.length ? kept : null;
}

const router: IRouter = Router();

// ---------- payload schemas ----------

const SurveyAssetPayload = z.object({
  externalAssetId: z.string().min(1),
  externalSurveyId: z.string().nullish(),
  name: z.string().min(1),
  description: z.string().nullish(),
  category: z.string().nullish(),
  venueName: z.string().nullish(),
  cityName: z.string().nullish(),
  publicPhotoUrl: z.string().nullish(),
  publicPhotos: z.array(z.object({ url: z.string(), caption: z.string().optional() })).nullish(),
  measurements: z.object({
    widthIn: z.number().nullish(),
    heightIn: z.number().nullish(),
    depthIn: z.number().nullish(),
    diameterIn: z.number().nullish(),
    areaSqft: z.number().nullish(),
    shape: z.string().nullish(),
    measurementUnit: z.enum(["in", "cm", "ft"]).nullish(),
    orientation: z.string().nullish(),
  }).nullish(),
  surface: z.object({
    surfaceMaterial: z.string().nullish(),
    environment: z.string().nullish(),
    zoneName: z.string().nullish(),
  }).nullish(),
  applications: z.object({
    primary: z.array(z.string()).nullish(),
    recommended: z.array(z.string()).nullish(),
    alternate: z.array(z.string()).nullish(),
    publicUseCase: z.string().nullish(),
  }).nullish(),
  visibility: z.object({
    visibilityTier: z.string().nullish(),
    publicStatus: z.string().nullish(),
    publicDeckInclude: z.boolean().nullish(),
    portalVisible: z.boolean().nullish(),
    netsuiteInclude: z.boolean().nullish(),
    designNeeded: z.boolean().nullish(),
    commissionEligible: z.boolean().nullish(),
    opsOwner: z.string().nullish(),
  }).nullish(),
  approvedMaterials: z.array(z.string()).nullish(),
  // Internal-only fields the survey app may attach. We accept and store them
  // server-side but they are NEVER reflected back on /public/* responses.
  internal: z.object({
    notes: z.string().nullish(),
    installNotes: z.string().nullish(),
    productionNotes: z.string().nullish(),
    pricingNotes: z.string().nullish(),
    photos: z.array(z.object({ url: z.string(), caption: z.string().optional() })).nullish(),
    netsuiteAssetNumber: z.string().nullish(),
    netsuiteVenueNumber: z.string().nullish(),
    netsuiteItemName: z.string().nullish(),
    netsuiteItemCategory: z.string().nullish(),
    costCenter: z.string().nullish(),
    surveyorName: z.string().nullish(),
    surveyedAt: z.string().nullish(),
  }).nullish(),
});

const WebhookEnvelope = z.object({
  partnerSlug: z.string().nullish(),
  assets: z.array(SurveyAssetPayload).min(1),
});

type SurveyAssetPayloadT = z.infer<typeof SurveyAssetPayload>;

// ---------- shared helpers ----------

/**
 * Constant-time HMAC verification of the raw request body. Express's JSON
 * middleware (registered globally) parses the body before us, so we capture
 * the raw bytes in a verifier hook (see app.ts) and stash them on `req`.
 */
function verifySignature(rawBody: Buffer | string | undefined, secret: string, signature: string | undefined): boolean {
  if (!signature || !rawBody) return false;
  const body = typeof rawBody === "string" ? rawBody : rawBody.toString("utf8");
  const expected = crypto.createHmac("sha256", secret).update(body).digest("hex");
  // Strip optional `sha256=` prefix.
  const got = signature.startsWith("sha256=") ? signature.slice(7) : signature;
  if (got.length !== expected.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(got, "hex"), Buffer.from(expected, "hex"));
  } catch {
    return false;
  }
}

async function ingestAssets(partnerId: number, assets: SurveyAssetPayloadT[], opts: { autoApprove: boolean; rawJson?: unknown }): Promise<{ created: number; updated: number; assetIds: number[] }> {
  let created = 0, updated = 0;
  const ids: number[] = [];
  for (const a of assets) {
    const m = a.measurements ?? {};
    const internal = a.internal ?? {};
    const surface = a.surface ?? {};
    const apps = a.applications ?? {};
    const vis = a.visibility ?? {};
    // Mirror photos to our object storage so the public portal never serves
    // images straight from the survey app domain (decouples us from upstream
    // URL changes / outages and keeps the partner portal on our origin).
    const mirroredPublicPhotoUrl = await mirrorExternalImage(a.publicPhotoUrl ?? null);
    const mirroredPublicPhotos = await mirrorPhotoArray(a.publicPhotos ?? null);
    const mirroredInternalPhotos = await mirrorPhotoArray(internal.photos ?? null);
    const baseValues = {
      partnerId,
      externalAssetId: a.externalAssetId,
      externalSurveyId: a.externalSurveyId ?? null,
      sourceApp: "venue_asset_survey",
      name: a.name,
      description: a.description ?? null,
      category: a.category ?? null,
      venueName: a.venueName ?? null,
      cityName: a.cityName ?? null,
      publicPhotoUrl: mirroredPublicPhotoUrl,
      publicPhotosJson: mirroredPublicPhotos,
      widthIn: m.widthIn ?? null,
      heightIn: m.heightIn ?? null,
      depthIn: m.depthIn ?? null,
      diameterIn: m.diameterIn ?? null,
      areaSqft: m.areaSqft ?? null,
      shape: m.shape ?? null,
      measurementUnit: m.measurementUnit ?? null,
      orientation: m.orientation ?? null,
      surfaceMaterial: surface.surfaceMaterial ?? null,
      environment: surface.environment ?? null,
      zoneName: surface.zoneName ?? null,
      primaryApplicationsJson: apps.primary ?? null,
      recommendedApplicationsJson: apps.recommended ?? null,
      alternateApplicationsJson: apps.alternate ?? null,
      publicUseCase: apps.publicUseCase ?? null,
      visibilityTier: vis.visibilityTier ?? null,
      publicStatus: vis.publicStatus ?? null,
      publicDeckInclude: vis.publicDeckInclude ?? true,
      portalVisible: vis.portalVisible ?? true,
      netsuiteInclude: vis.netsuiteInclude ?? false,
      designNeeded: vis.designNeeded ?? false,
      commissionEligible: vis.commissionEligible ?? false,
      opsOwner: vis.opsOwner ?? null,
      // Default per-item shortlist = recommended ∪ alternate when upstream omits it.
      approvedMaterialsJson: a.approvedMaterials
        ?? (apps.recommended || apps.alternate
            ? Array.from(new Set([...(apps.recommended ?? []), ...(apps.alternate ?? [])]))
            : null),
      internalNotes: internal.notes ?? null,
      installNotes: internal.installNotes ?? null,
      productionNotes: internal.productionNotes ?? null,
      internalPricingNotes: internal.pricingNotes ?? null,
      internalPhotosJson: mirroredInternalPhotos,
      netsuiteAssetNumber: internal.netsuiteAssetNumber ?? null,
      netsuiteVenueNumber: internal.netsuiteVenueNumber ?? null,
      netsuiteItemName: internal.netsuiteItemName ?? null,
      netsuiteItemCategory: internal.netsuiteItemCategory ?? null,
      costCenter: internal.costCenter ?? null,
      surveyorName: internal.surveyorName ?? null,
      surveyedAt: internal.surveyedAt ? new Date(internal.surveyedAt) : null,
      rawPayloadJson: (opts.rawJson ?? a) as unknown,
      lastSyncedAt: new Date(),
    } satisfies Partial<typeof surveyAssetsTable.$inferInsert> as typeof surveyAssetsTable.$inferInsert;
    // Re-sync forces approvalStatus → pending unless integration.autoApprove.
    const [existing] = await db.select().from(surveyAssetsTable)
      .where(and(eq(surveyAssetsTable.partnerId, partnerId), eq(surveyAssetsTable.externalAssetId, a.externalAssetId)));
    if (existing) {
      const resetReview = !opts.autoApprove;
      await db.update(surveyAssetsTable).set({
        ...baseValues,
        ...(resetReview
          ? { approvalStatus: "pending" as const, approvedAt: null, approvedBy: null, rejectedReason: null }
          : { approvalStatus: "approved" as const, approvedAt: new Date(), approvedBy: "auto_approve" }),
      }).where(eq(surveyAssetsTable.id, existing.id));
      ids.push(existing.id);
      updated++;
    } else {
      const [row] = await db.insert(surveyAssetsTable).values({
        ...baseValues,
        approvalStatus: opts.autoApprove ? "approved" : "pending",
        approvedAt: opts.autoApprove ? new Date() : null,
        approvedBy: opts.autoApprove ? "auto_approve" : null,
      }).returning({ id: surveyAssetsTable.id });
      if (row) { ids.push(row.id); created++; }
    }
  }
  return { created, updated, assetIds: ids };
}

async function ensureGlobalMaterialsSeeded(): Promise<void> {
  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(approvedMaterialsTable);
  if (count > 0) return;
  await db.insert(approvedMaterialsTable).values(DEFAULT_APPROVED_MATERIALS.map(m => ({ ...m, isActive: true })));
}

async function loadGlobalMaterialNames(): Promise<string[]> {
  await ensureGlobalMaterialsSeeded();
  const rows = await db.select().from(approvedMaterialsTable)
    .where(eq(approvedMaterialsTable.isActive, true))
    .orderBy(approvedMaterialsTable.sortOrder);
  return rows.map(r => r.name);
}

/**
 * The public projection used by /public/partners/:slug/ordering and the
 * "Brand our space" tile gallery on the partner portal. Returns ONLY approved,
 * active assets and ONLY the public-safe fields.
 */
export async function buildPublicSurveyAssets(partnerId: number): Promise<ReturnType<typeof toPublicSurveyAsset>[]> {
  const rows = await db.select().from(surveyAssetsTable)
    .where(and(
      eq(surveyAssetsTable.partnerId, partnerId),
      eq(surveyAssetsTable.approvalStatus, "approved"),
      eq(surveyAssetsTable.isActive, true),
      // portalVisible is the kill-switch ops sets when an asset must be
      // hidden from customers without losing approval/audit history.
      eq(surveyAssetsTable.portalVisible, true),
    ))
    .orderBy(desc(surveyAssetsTable.approvedAt));
  const globals = await loadGlobalMaterialNames();
  // Honor publicStatus when set: only "live" rows reach the customer portal.
  // null/undefined remains visible for backward compatibility with rows that
  // pre-date this column.
  return rows
    .filter(r => r.publicStatus == null || r.publicStatus === "live")
    .map(r => toPublicSurveyAsset(r, globals));
}

/**
 * Internal lookup used by intake email + admin panel — full row, NOT
 * public-safe. ALWAYS partner-scoped to prevent cross-tenant data exposure:
 * if order line on Partner A references an asset id belonging to Partner B,
 * the lookup returns an empty Map (caller renders nothing for that line).
 */
export async function loadSurveyAssetsByIdsForPartner(ids: number[], partnerId: number): Promise<Map<number, SurveyAsset>> {
  if (!ids.length) return new Map();
  const rows = await db.select().from(surveyAssetsTable)
    .where(and(
      inArray(surveyAssetsTable.id, ids),
      eq(surveyAssetsTable.partnerId, partnerId),
    ));
  return new Map(rows.map(r => [r.id, r]));
}

/**
 * Validate that a list of `surveyAssetId`s submitted on a public order all
 * belong to the given partner AND are approved + active. Returns the set of
 * IDs that pass; caller treats absent ids as an authorization failure.
 */
/**
 * Resolve the allowed material list for a single survey asset, mirroring
 * the logic of `toPublicSurveyAsset`. Returned as a lower-cased Set for
 * case-insensitive membership checks at order-submit time.
 */
export async function resolveAllowedMaterialsForAsset(assetId: number, partnerId: number): Promise<Set<string> | null> {
  const [a] = await db.select().from(surveyAssetsTable)
    .where(and(eq(surveyAssetsTable.id, assetId), eq(surveyAssetsTable.partnerId, partnerId)));
  if (!a) return null;
  let materials: string[];
  if (a.materialOverrideMode === "custom") materials = a.customApprovedMaterialsJson ?? [];
  else if (a.materialOverrideMode === "per_item") materials = a.approvedMaterialsJson ?? await loadGlobalMaterialNames();
  else materials = await loadGlobalMaterialNames();
  return new Set(materials.map(m => m.trim().toLowerCase()));
}

export async function validateSurveyAssetIdsForPartner(ids: number[], partnerId: number): Promise<Set<number>> {
  if (!ids.length) return new Set();
  const rows = await db.select({ id: surveyAssetsTable.id, publicStatus: surveyAssetsTable.publicStatus })
    .from(surveyAssetsTable)
    .where(and(
      inArray(surveyAssetsTable.id, ids),
      eq(surveyAssetsTable.partnerId, partnerId),
      eq(surveyAssetsTable.approvalStatus, "approved"),
      eq(surveyAssetsTable.isActive, true),
      eq(surveyAssetsTable.portalVisible, true),
    ));
  return new Set(
    rows.filter(r => r.publicStatus == null || r.publicStatus === "live").map(r => r.id),
  );
}

// ---------- 0. PUBLIC list (rendered on partner portal) ----------

router.get("/public/partners/:slug/survey-assets", async (req, res): Promise<void> => {
  const slug = String(req.params.slug);
  const [partner] = await db.select({ id: partnersTable.id, isActive: partnersTable.isActive, launchStatus: partnersTable.launchStatus })
    .from(partnersTable).where(eq(partnersTable.slug, slug));
  if (!partner || !partner.isActive || !["live", "preview"].includes(partner.launchStatus)) {
    res.status(404).json({ error: "Partner not found" }); return;
  }
  const assets = await buildPublicSurveyAssets(partner.id);
  res.json({ assets });
});

// ---------- 1. PUBLIC webhook ----------

router.post("/public/integrations/asset-survey/:partnerSlug", async (req, res): Promise<void> => {
  try {
    const slug = String(req.params.partnerSlug);
    const [partner] = await db.select().from(partnersTable).where(eq(partnersTable.slug, slug));
    if (!partner) { res.status(404).json({ error: "Partner not found" }); return; }
    const [integ] = await db.select().from(partnerIntegrationsTable)
      .where(and(eq(partnerIntegrationsTable.partnerId, partner.id), eq(partnerIntegrationsTable.integrationType, "venue_asset_survey")));
    if (!integ || !integ.isEnabled || !integ.webhookSecret) {
      res.status(403).json({ error: "Integration not enabled for this partner" }); return;
    }
    const sig = req.header("x-survey-signature") || req.header("X-Survey-Signature") || undefined;
    const raw = req.rawBody;
    if (!verifySignature(raw, integ.webhookSecret, sig)) {
      req.log?.warn({ partnerId: partner.id }, "survey webhook signature invalid");
      res.status(401).json({ error: "Invalid signature" }); return;
    }
    const parsed = WebhookEnvelope.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
    const result = await ingestAssets(partner.id, parsed.data.assets, { autoApprove: integ.autoApprove, rawJson: req.body });
    await db.update(partnerIntegrationsTable)
      .set({ lastWebhookAt: new Date(), lastPullStatus: "ok", lastPullError: null })
      .where(eq(partnerIntegrationsTable.id, integ.id));
    req.log?.info({ partnerId: partner.id, ...result }, "survey webhook ingested");
    res.json({ ok: true, ...result });
  } catch (err) {
    req.log?.error({ err }, "survey webhook failed");
    res.status(500).json({ error: err instanceof Error ? err.message : "Webhook failed" });
  }
});

// ---------- 2. ADMIN pull ----------

router.post("/admin/integrations/asset-survey/pull/:partnerId", async (req, res): Promise<void> => {
  const auth = getAuth(req);
  if (!auth?.userId) { res.status(401).json({ error: "Authentication required" }); return; }
  const partnerId = Number(req.params.partnerId);
  if (!partnerId) { res.status(400).json({ error: "Invalid partner id" }); return; }
  const [integ] = await db.select().from(partnerIntegrationsTable)
    .where(and(eq(partnerIntegrationsTable.partnerId, partnerId), eq(partnerIntegrationsTable.integrationType, "venue_asset_survey")));
  if (!integ || !integ.apiBaseUrl) {
    res.status(400).json({ error: "Pull is not configured. Set apiBaseUrl + apiKey on the integration first." }); return;
  }
  try {
    const url = new URL("/v1/assets", integ.apiBaseUrl);
    if (integ.externalPartnerId) url.searchParams.set("partnerId", integ.externalPartnerId);
    // SSRF guard (https + safe host + no redirects + timeout).
    if (url.protocol !== "https:") {
      res.status(400).json({ error: "Survey API URL must use https://" }); return;
    }
    if (!(await isHostSafe(url.hostname))) {
      res.status(400).json({ error: "Survey API host is not allowed (private/internal address blocked)." }); return;
    }
    // Resolve API key from env (Replit Secret) by reference; never stored in DB.
    const apiKey = integ.apiKeySecretName ? process.env[integ.apiKeySecretName] : undefined;
    const r = await fetch(url.toString(), {
      headers: apiKey ? { authorization: `Bearer ${apiKey}`, accept: "application/json" } : { accept: "application/json" },
      signal: AbortSignal.timeout(15_000),
      redirect: "error",
    });
    if (!r.ok) {
      const text = await r.text().catch(() => "");
      throw new Error(`Survey API ${r.status}: ${text.slice(0, 200)}`);
    }
    const json = (await r.json()) as unknown;
    const envelope = z.object({ assets: z.array(SurveyAssetPayload) }).safeParse(json);
    if (!envelope.success) throw new Error(`Bad upstream payload: ${envelope.error.message}`);
    const result = await ingestAssets(partnerId, envelope.data.assets, { autoApprove: integ.autoApprove, rawJson: json });
    await db.update(partnerIntegrationsTable)
      .set({ lastPullAt: new Date(), lastPullStatus: "ok", lastPullError: null })
      .where(eq(partnerIntegrationsTable.id, integ.id));
    sendValidated(req, res, PullSurveyAssetsResponse, { ok: true, ...result }, "Pull survey assets");
  } catch (err) {
    await db.update(partnerIntegrationsTable)
      .set({ lastPullAt: new Date(), lastPullStatus: "error", lastPullError: String(err instanceof Error ? err.message : String(err)).slice(0, 500) })
      .where(eq(partnerIntegrationsTable.id, integ.id));
    res.status(502).json({ error: err instanceof Error ? err.message : "Pull failed" });
  }
});

// ---------- 3. ADMIN review / management ----------

router.get("/admin/survey-assets", async (req, res): Promise<void> => {
  const auth = getAuth(req);
  if (!auth?.userId) { res.status(401).json({ error: "Authentication required" }); return; }
  const partnerId = req.query.partnerId ? Number(req.query.partnerId) : null;
  const status = typeof req.query.status === "string" ? req.query.status : null;
  const conds: ReturnType<typeof eq>[] = [];
  if (partnerId) conds.push(eq(surveyAssetsTable.partnerId, partnerId));
  if (status && (SURVEY_APPROVAL_STATUSES as readonly string[]).includes(status)) {
    conds.push(eq(surveyAssetsTable.approvalStatus, status));
  }
  const rows = await db.select().from(surveyAssetsTable)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(surveyAssetsTable.ingestedAt))
    .limit(500);
  sendValidated(req, res, ListAdminSurveyAssetsResponse, { assets: rows }, "List admin survey assets");
});

router.get("/admin/survey-assets/:id", async (req, res): Promise<void> => {
  const auth = getAuth(req);
  if (!auth?.userId) { res.status(401).json({ error: "Authentication required" }); return; }
  const id = Number(req.params.id);
  const [a] = await db.select().from(surveyAssetsTable).where(eq(surveyAssetsTable.id, id));
  if (!a) { res.status(404).json({ error: "Not found" }); return; }
  sendValidated(req, res, GetAdminSurveyAssetResponse, { asset: a }, "Get admin survey asset");
});

const PatchAssetBody = z.object({
  approvalStatus: z.enum(SURVEY_APPROVAL_STATUSES).optional(),
  rejectedReason: z.string().nullish(),
  isActive: z.boolean().optional(),
  name: z.string().min(1).optional(),
  description: z.string().nullish(),
  category: z.string().nullish(),
  publicPhotoUrl: z.string().nullish(),
  approvedMaterialsJson: z.array(z.string()).nullish(),
  customApprovedMaterialsJson: z.array(z.string()).nullish(),
  materialOverrideMode: z.enum(SURVEY_MATERIAL_MODES).optional(),
  internalNotes: z.string().nullish(),
  installNotes: z.string().nullish(),
  productionNotes: z.string().nullish(),
});

router.patch("/admin/survey-assets/:id", async (req, res): Promise<void> => {
  const auth = getAuth(req);
  if (!auth?.userId) { res.status(401).json({ error: "Authentication required" }); return; }
  const id = Number(req.params.id);
  const parsed = PatchAssetBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const updates: Record<string, unknown> = { ...parsed.data };
  if (parsed.data.approvalStatus === "approved") {
    updates.approvedAt = new Date();
    updates.approvedBy = auth.userId;
    updates.rejectedReason = null;
  } else if (parsed.data.approvalStatus === "rejected") {
    updates.approvedAt = null;
  }
  await db.update(surveyAssetsTable).set(updates).where(eq(surveyAssetsTable.id, id));
  const [row] = await db.select().from(surveyAssetsTable).where(eq(surveyAssetsTable.id, id));
  // Task #5 step 6: keep partner_addons in lockstep with approval state. On
  // approve we upsert a row keyed by (partnerId, surveyAssetId) — re-syncs
  // hit the same row via the unique index. On reject we deactivate it; the
  // row is preserved so re-approving restores the same sortOrder/featured.
  if (row && parsed.data.approvalStatus === "approved") {
    await db.insert(partnerAddonsTable).values({
      partnerId: row.partnerId,
      surveyAssetId: row.id,
      isActive: true,
      categoryOverride: "Brand our space",
    }).onConflictDoUpdate({
      target: [partnerAddonsTable.partnerId, partnerAddonsTable.surveyAssetId],
      set: { isActive: true, updatedAt: new Date() },
    });
  } else if (row && parsed.data.approvalStatus === "rejected") {
    await db.update(partnerAddonsTable).set({ isActive: false, updatedAt: new Date() })
      .where(and(
        eq(partnerAddonsTable.partnerId, row.partnerId),
        eq(partnerAddonsTable.surveyAssetId, row.id),
      ));
  }
  sendValidated(req, res, UpdateAdminSurveyAssetResponse, { asset: row }, "Update admin survey asset");
});

router.delete("/admin/survey-assets/:id", async (req, res): Promise<void> => {
  const auth = getAuth(req);
  if (!auth?.userId) { res.status(401).json({ error: "Authentication required" }); return; }
  const id = Number(req.params.id);
  await db.delete(surveyAssetsTable).where(eq(surveyAssetsTable.id, id));
  sendValidated(req, res, DeleteAdminSurveyAssetResponse, { ok: true }, "Delete admin survey asset");
});

// ----- approved materials (global) -----

router.get("/admin/approved-materials", async (req, res): Promise<void> => {
  const auth = getAuth(req);
  if (!auth?.userId) { res.status(401).json({ error: "Authentication required" }); return; }
  await ensureGlobalMaterialsSeeded();
  const rows = await db.select().from(approvedMaterialsTable).orderBy(approvedMaterialsTable.sortOrder);
  sendValidated(req, res, ListApprovedMaterialsResponse, { materials: rows }, "List approved materials");
});

const UpsertMaterialBody = z.object({
  name: z.string().min(1),
  category: z.string().nullish(),
  description: z.string().nullish(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

router.post("/admin/approved-materials", async (req, res): Promise<void> => {
  const auth = getAuth(req);
  if (!auth?.userId) { res.status(401).json({ error: "Authentication required" }); return; }
  const parsed = UpsertMaterialBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [row] = await db.insert(approvedMaterialsTable).values({
    name: parsed.data.name,
    category: parsed.data.category ?? null,
    description: parsed.data.description ?? null,
    sortOrder: parsed.data.sortOrder ?? 0,
    isActive: parsed.data.isActive ?? true,
  }).returning();
  res.status(201).json({ material: row });
});

router.patch("/admin/approved-materials/:id", async (req, res): Promise<void> => {
  const auth = getAuth(req);
  if (!auth?.userId) { res.status(401).json({ error: "Authentication required" }); return; }
  const id = Number(req.params.id);
  const PatchBody = z.object({
    name: z.string().min(1).optional(),
    category: z.string().nullish(),
    description: z.string().nullish(),
    sortOrder: z.number().int().optional(),
    isActive: z.boolean().optional(),
  });
  const parsed = PatchBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  await db.update(approvedMaterialsTable).set(parsed.data).where(eq(approvedMaterialsTable.id, id));
  const [row] = await db.select().from(approvedMaterialsTable).where(eq(approvedMaterialsTable.id, id));
  sendValidated(req, res, UpdateApprovedMaterialResponse, { material: row }, "Update approved material");
});

router.delete("/admin/approved-materials/:id", async (req, res): Promise<void> => {
  const auth = getAuth(req);
  if (!auth?.userId) { res.status(401).json({ error: "Authentication required" }); return; }
  await db.delete(approvedMaterialsTable).where(eq(approvedMaterialsTable.id, Number(req.params.id)));
  sendValidated(req, res, DeleteApprovedMaterialResponse, { ok: true }, "Delete approved material");
});

/**
 * Test that the configured survey app is reachable with the stored API key.
 * GET-only probe against `${apiBaseUrl}/health` (or the base URL itself if
 * /health 404s) — useful so admins know the integration is live before
 * triggering a real pull. Subject to the same SSRF guards as image mirroring.
 */
router.post("/admin/integrations/asset-survey/test/:partnerId", async (req, res): Promise<void> => {
  const auth = getAuth(req);
  if (!auth?.userId) { res.status(401).json({ error: "Authentication required" }); return; }
  const partnerId = Number(req.params.partnerId);
  const [integration] = await db.select().from(partnerIntegrationsTable)
    .where(and(eq(partnerIntegrationsTable.partnerId, partnerId), eq(partnerIntegrationsTable.integrationType, "venue_asset_survey")));
  if (!integration?.apiBaseUrl) { res.status(400).json({ ok: false, error: "No API base URL configured." }); return; }
  const apiKey = integration.apiKeySecretName ? process.env[integration.apiKeySecretName] : undefined;
  let parsed: URL;
  try { parsed = new URL(integration.apiBaseUrl); } catch {
    res.status(400).json({ ok: false, error: "Invalid API base URL." }); return;
  }
  if (parsed.protocol !== "https:") { res.status(400).json({ ok: false, error: "API base URL must use https://" }); return; }
  if (!(await isHostSafe(parsed.hostname))) {
    res.status(400).json({ ok: false, error: "API base URL host is not reachable from this server (private/blocked)." });
    return;
  }
  const probeUrl = integration.apiBaseUrl.replace(/\/$/, "") + "/health";
  try {
    const r = await fetch(probeUrl, {
      signal: AbortSignal.timeout(8_000),
      redirect: "error",
      headers: apiKey ? { "Authorization": `Bearer ${apiKey}` } : undefined,
    });
    sendValidated(req, res, SurveyTestConnectionResponse, {
      ok: r.ok,
      status: r.status,
      probedUrl: probeUrl,
      apiKeyPresent: Boolean(apiKey),
      message: r.ok ? "Survey app reachable." : `Survey app returned HTTP ${r.status}.`,
    }, "Survey test connection");
  } catch (e) {
    res.status(502).json({ ok: false, error: e instanceof Error ? e.message : "Request failed", probedUrl: probeUrl });
  }
});

// ----- per-partner integration config -----

router.get("/admin/partners/:partnerId/integrations/asset-survey", async (req, res): Promise<void> => {
  const auth = getAuth(req);
  if (!auth?.userId) { res.status(401).json({ error: "Authentication required" }); return; }
  const partnerId = Number(req.params.partnerId);
  const [row] = await db.select().from(partnerIntegrationsTable)
    .where(and(eq(partnerIntegrationsTable.partnerId, partnerId), eq(partnerIntegrationsTable.integrationType, "venue_asset_survey")));
  // Mask the secret on read — admin sees length only. apiKey is a secret
  // reference (env var name); the actual value is never sent to the browser.
  const [partnerRow] = await db.select({ slug: partnersTable.slug }).from(partnersTable).where(eq(partnersTable.id, partnerId));
  const apiKeyPresent = row?.apiKeySecretName ? Boolean(process.env[row.apiKeySecretName]) : false;
  sendValidated(req, res, GetPartnerSurveyIntegrationResponse, {
    integration: row ? {
      id: row.id,
      partnerId: row.partnerId,
      integrationType: row.integrationType,
      isEnabled: row.isEnabled,
      autoApprove: row.autoApprove,
      apiBaseUrl: row.apiBaseUrl,
      apiKeySecretName: row.apiKeySecretName,
      apiKeyPresent,
      externalPartnerId: row.externalPartnerId,
      notes: row.notes,
      webhookSecretMasked: row.webhookSecret ? `${row.webhookSecret.slice(0, 4)}…(${row.webhookSecret.length} chars)` : null,
      lastWebhookAt: row.lastWebhookAt,
      lastPullAt: row.lastPullAt,
      lastPullStatus: row.lastPullStatus,
      lastPullError: row.lastPullError,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    } : null,
    webhookUrl: partnerRow ? `/api/public/integrations/asset-survey/${partnerRow.slug}` : null,
  }, "Get partner survey integration");
});

const UpsertIntegrationBody = z.object({
  isEnabled: z.boolean().optional(),
  autoApprove: z.boolean().optional(),
  apiBaseUrl: z.string().url().nullish(),
  // Name of the env var / Replit Secret containing the bearer token. The
  // actual secret value is never accepted via the API; admins set it through
  // Replit Secrets and reference it by name here.
  apiKeySecretName: z.string().regex(/^[A-Z][A-Z0-9_]*$/, "Must be UPPER_SNAKE_CASE env var name").nullish(),
  externalPartnerId: z.string().nullish(),
  notes: z.string().nullish(),
  rotateSecret: z.boolean().optional(),
});

router.put("/admin/partners/:partnerId/integrations/asset-survey", async (req, res): Promise<void> => {
  const auth = getAuth(req);
  if (!auth?.userId) { res.status(401).json({ error: "Authentication required" }); return; }
  const partnerId = Number(req.params.partnerId);
  const parsed = UpsertIntegrationBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [existing] = await db.select().from(partnerIntegrationsTable)
    .where(and(eq(partnerIntegrationsTable.partnerId, partnerId), eq(partnerIntegrationsTable.integrationType, "venue_asset_survey")));
  const newSecret = (!existing || parsed.data.rotateSecret) ? crypto.randomBytes(32).toString("hex") : existing.webhookSecret;
  if (existing) {
    // Distinguish missing field (keep existing) from explicit null (clear).
    const body = parsed.data;
    const keepIfMissing = <K extends keyof typeof body>(k: K, fallback: unknown) =>
      Object.prototype.hasOwnProperty.call(body, k) ? body[k] : fallback;
    await db.update(partnerIntegrationsTable).set({
      isEnabled: parsed.data.isEnabled ?? existing.isEnabled,
      autoApprove: parsed.data.autoApprove ?? existing.autoApprove,
      apiBaseUrl: keepIfMissing("apiBaseUrl", existing.apiBaseUrl) as string | null,
      apiKeySecretName: keepIfMissing("apiKeySecretName", existing.apiKeySecretName) as string | null,
      externalPartnerId: keepIfMissing("externalPartnerId", existing.externalPartnerId) as string | null,
      notes: keepIfMissing("notes", existing.notes) as string | null,
      webhookSecret: newSecret,
    }).where(eq(partnerIntegrationsTable.id, existing.id));
  } else {
    await db.insert(partnerIntegrationsTable).values({
      partnerId,
      integrationType: "venue_asset_survey",
      isEnabled: parsed.data.isEnabled ?? true,
      autoApprove: parsed.data.autoApprove ?? false,
      apiBaseUrl: parsed.data.apiBaseUrl ?? null,
      apiKeySecretName: parsed.data.apiKeySecretName ?? null,
      externalPartnerId: parsed.data.externalPartnerId ?? null,
      notes: parsed.data.notes ?? null,
      webhookSecret: newSecret,
    });
  }
  // Return the secret ONCE on rotate so admin can copy it.
  sendValidated(req, res, UpsertPartnerSurveyIntegrationResponse, { ok: true, ...(parsed.data.rotateSecret || !existing ? { newWebhookSecret: newSecret } : {}) }, "Upsert partner survey integration");
});

export default router;
