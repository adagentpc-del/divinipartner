import { Router, type IRouter } from "express";
import { eq, and, desc, inArray, or, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import {
  db,
  assetsTable,
  assetLinksTable,
  assetEventsTable,
  ordersTable,
  orderItemsTable,
  partnersTable,
  eventsTable,
  productCatalogTable,
  suppliersTable,
} from "@workspace/db";
import { fire } from "../services/workflowEngine";
import { emit as usageEmit, emitFirst as usageEmitFirst } from "../services/usageTracking";

const router: IRouter = Router();

const ASSET_CATEGORIES = ["client_artwork", "approved_artwork", "proof", "print_ready", "reference", "install_reference", "shipping_document", "photo", "spec", "internal_only"] as const;
const VISIBILITIES = ["internal_only", "partner_visible", "client_visible", "vendor_visible"] as const;
const STATUSES = ["uploaded", "under_review", "revision_requested", "approved", "superseded", "vendor_released", "archived"] as const;

async function logEvent(input: { assetId?: number; orderId?: number; orderItemId?: number; eventType: string; fromValue?: string | null; toValue?: string | null; actorUserId?: string | null; notes?: string | null; }) {
  await db.insert(assetEventsTable).values({
    assetId: input.assetId ?? null,
    orderId: input.orderId ?? null,
    orderItemId: input.orderItemId ?? null,
    eventType: input.eventType,
    fromValue: input.fromValue ?? null,
    toValue: input.toValue ?? null,
    actorUserId: input.actorUserId ?? null,
    notes: input.notes ?? null,
  } as any);
}

async function withLinks(assets: any[]) {
  if (!assets.length) return [];
  const ids = assets.map(a => a.id);
  const links = await db.select().from(assetLinksTable).where(inArray(assetLinksTable.assetId, ids));
  const byAsset = new Map<number, any[]>();
  for (const l of links) {
    const arr = byAsset.get(l.assetId) || [];
    arr.push(l);
    byAsset.set(l.assetId, arr);
  }
  return assets.map(a => ({ ...a, links: byAsset.get(a.id) || [] }));
}

// ===== List assets =====
router.get("/assets", async (req, res) => {
  const q = req.query as Record<string, string | undefined>;
  const conds: any[] = [];
  if (q.partnerId) conds.push(eq(assetsTable.partnerId, parseInt(q.partnerId)));
  if (q.eventId) conds.push(eq(assetsTable.eventId, parseInt(q.eventId)));
  if (q.orderId) conds.push(eq(assetsTable.orderId, parseInt(q.orderId)));
  if (q.productId) conds.push(eq(assetsTable.productId, parseInt(q.productId)));
  if (q.brandingZoneId) conds.push(eq(assetsTable.brandingZoneId, parseInt(q.brandingZoneId)));
  if (q.supplierId) conds.push(eq(assetsTable.supplierId, parseInt(q.supplierId)));
  if (q.category) conds.push(eq(assetsTable.category, q.category));
  if (q.status) conds.push(eq(assetsTable.status, q.status));
  if (q.visibility) conds.push(eq(assetsTable.visibility, q.visibility));
  if (q.currentOnly === "true") conds.push(eq(assetsTable.isCurrent, true));
  if (q.approvedOnly === "true") conds.push(eq(assetsTable.approvalStatus, "approved"));
  if (q.orderItemId) {
    const links = await db.select().from(assetLinksTable).where(eq(assetLinksTable.orderItemId, parseInt(q.orderItemId)));
    const ids = links.map(l => l.assetId);
    if (!ids.length) return res.json([]);
    conds.push(inArray(assetsTable.id, ids));
  }
  const rows = conds.length
    ? await db.select().from(assetsTable).where(and(...conds)).orderBy(desc(assetsTable.createdAt))
    : await db.select().from(assetsTable).orderBy(desc(assetsTable.createdAt));
  res.json(await withLinks(rows));
});

// ===== Get one (with links + event history + version siblings) =====
router.get("/assets/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
  const [asset] = await db.select().from(assetsTable).where(eq(assetsTable.id, id));
  if (!asset) return res.status(404).json({ error: "Not found" });
  const links = await db.select().from(assetLinksTable).where(eq(assetLinksTable.assetId, id));
  const events = await db.select().from(assetEventsTable).where(eq(assetEventsTable.assetId, id)).orderBy(desc(assetEventsTable.createdAt));
  // Version family: same parentAssetId chain
  const rootId = asset.parentAssetId || asset.id;
  const versions = await db.select().from(assetsTable).where(or(eq(assetsTable.id, rootId), eq(assetsTable.parentAssetId, rootId)));
  res.json({ ...asset, links, events, versions: versions.sort((a, b) => a.version - b.version) });
});

// ===== Create asset (after upload) =====
const CreateBody = z.object({
  title: z.string().min(1),
  fileUrl: z.string().min(1),
  fileName: z.string().nullable().optional(),
  mimeType: z.string().nullable().optional(),
  fileSize: z.number().int().nullable().optional(),
  category: z.enum(ASSET_CATEGORIES).default("client_artwork"),
  visibility: z.enum(VISIBILITIES).default("internal_only"),
  partnerId: z.number().int().nullable().optional(),
  eventId: z.number().int().nullable().optional(),
  orderId: z.number().int().nullable().optional(),
  productId: z.number().int().nullable().optional(),
  packageId: z.number().int().nullable().optional(),
  brandingZoneId: z.number().int().nullable().optional(),
  supplierId: z.number().int().nullable().optional(),
  ownerType: z.string().nullable().optional(),
  ownerId: z.number().int().nullable().optional(),
  uploadedByUserId: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  tagsJson: z.array(z.string()).nullable().optional(),
  linkOrderItemIds: z.array(z.number().int()).optional(),
});
router.post("/assets", async (req, res) => {
  const parsed = CreateBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
  const data = parsed.data;
  const { linkOrderItemIds, ...payload } = data;
  const [row] = await db.insert(assetsTable).values(payload as any).returning();
  if (linkOrderItemIds && linkOrderItemIds.length) {
    await db.insert(assetLinksTable).values(linkOrderItemIds.map(oid => ({
      assetId: row.id,
      orderItemId: oid,
      role: row.category === "proof" ? "proof" : "primary_artwork",
    })) as any);
  }
  await logEvent({ assetId: row.id, orderId: row.orderId ?? undefined, eventType: "uploaded", toValue: row.title, actorUserId: data.uploadedByUserId ?? null });
  fire("asset.uploaded", { objectType: "asset", objectId: row.id, assetId: row.id, orderId: row.orderId ?? null, partnerId: row.partnerId ?? null, eventId: row.eventId ?? null, assetTitle: row.title }).catch(() => {});
  res.json(row);
});

// ===== Patch (status, visibility, notes, etc.) =====
const PatchBody = z.object({
  title: z.string().optional(),
  category: z.enum(ASSET_CATEGORIES).optional(),
  visibility: z.enum(VISIBILITIES).optional(),
  status: z.enum(STATUSES).optional(),
  approvalStatus: z.enum(["pending", "approved", "rejected", "not_required"]).optional(),
  productionReady: z.boolean().optional(),
  notes: z.string().nullable().optional(),
  tagsJson: z.array(z.string()).nullable().optional(),
  isCurrent: z.boolean().optional(),
});
router.patch("/assets/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
  const parsed = PatchBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
  const [prev] = await db.select().from(assetsTable).where(eq(assetsTable.id, id));
  if (!prev) return res.status(404).json({ error: "Not found" });
  // Safety: cannot mark vendor_released or vendor_visible without an approved approvalStatus
  const nextApproval = parsed.data.approvalStatus ?? prev.approvalStatus;
  if (parsed.data.status === "vendor_released" && nextApproval !== "approved") {
    return res.status(400).json({ error: "Cannot release to vendor: asset is not approved. Approve it first." });
  }
  if (parsed.data.visibility === "vendor_visible" && nextApproval !== "approved") {
    return res.status(400).json({ error: "Cannot set vendor visibility on an unapproved asset." });
  }
  const [row] = await db.update(assetsTable).set({ ...parsed.data, updatedAt: new Date() } as any).where(eq(assetsTable.id, id)).returning();
  if (parsed.data.status && parsed.data.status !== prev.status) {
    await logEvent({ assetId: id, orderId: prev.orderId ?? undefined, eventType: "status_change", fromValue: prev.status, toValue: parsed.data.status });
  }
  if (parsed.data.visibility && parsed.data.visibility !== prev.visibility) {
    await logEvent({ assetId: id, orderId: prev.orderId ?? undefined, eventType: "visibility_change", fromValue: prev.visibility, toValue: parsed.data.visibility });
  }
  res.json(row);
});

// ===== Approve =====
router.post("/assets/:id/approve", async (req, res) => {
  const id = parseInt(req.params.id);
  const userId: string | null = req.body?.userId || null;
  const releaseToVendor: boolean = req.body?.releaseToVendor !== false;
  const [prev] = await db.select().from(assetsTable).where(eq(assetsTable.id, id));
  if (!prev) return res.status(404).json({ error: "Not found" });
  const patch: any = {
    status: releaseToVendor ? "vendor_released" : "approved",
    approvalStatus: "approved",
    approvedByUserId: userId,
    approvedAt: new Date(),
    productionReady: true,
    updatedAt: new Date(),
  };
  if (releaseToVendor) {
    patch.releasedToVendorAt = new Date();
    patch.visibility = "vendor_visible";
  }
  const [row] = await db.update(assetsTable).set(patch).where(eq(assetsTable.id, id)).returning();
  await logEvent({ assetId: id, orderId: prev.orderId ?? undefined, eventType: "approved", toValue: patch.status, actorUserId: userId });
  if (releaseToVendor) await logEvent({ assetId: id, orderId: prev.orderId ?? undefined, eventType: "released_to_vendor", actorUserId: userId });
  fire("asset.approved", { objectType: "asset", objectId: id, assetId: id, orderId: row.orderId ?? null, partnerId: row.partnerId ?? null, eventId: row.eventId ?? null, assetTitle: row.title, releasedToVendor: releaseToVendor }).catch(() => {});
  usageEmit("asset.approved", { partnerId: row.partnerId ?? null, objectType: "asset", objectId: id }).catch(() => {});
  usageEmitFirst("first_asset_approved", { partnerId: row.partnerId ?? null, objectType: "asset", objectId: id }).catch(() => {});
  res.json(row);
});

// ===== Request revision =====
router.post("/assets/:id/request-revision", async (req, res) => {
  const id = parseInt(req.params.id);
  const userId: string | null = req.body?.userId || null;
  const note: string | null = req.body?.notes || null;
  const [row] = await db.update(assetsTable).set({ status: "revision_requested", approvalStatus: "rejected", productionReady: false, updatedAt: new Date() } as any).where(eq(assetsTable.id, id)).returning();
  if (!row) return res.status(404).json({ error: "Not found" });
  await logEvent({ assetId: id, orderId: row.orderId ?? undefined, eventType: "revision_requested", actorUserId: userId, notes: note });
  fire("asset.revision_requested", { objectType: "asset", objectId: id, assetId: id, orderId: row.orderId ?? null, partnerId: row.partnerId ?? null, eventId: row.eventId ?? null, assetTitle: row.title, note }).catch(() => {});
  res.json(row);
});

// ===== Upload new version =====
const NewVersionBody = z.object({
  fileUrl: z.string().min(1),
  fileName: z.string().nullable().optional(),
  mimeType: z.string().nullable().optional(),
  fileSize: z.number().int().nullable().optional(),
  uploadedByUserId: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});
router.post("/assets/:id/new-version", async (req, res) => {
  const id = parseInt(req.params.id);
  const parsed = NewVersionBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
  const [requested] = await db.select().from(assetsTable).where(eq(assetsTable.id, id));
  if (!requested) return res.status(404).json({ error: "Not found" });
  const rootId = requested.parentAssetId || requested.id;

  try {
    const result = await db.transaction(async (tx) => {
      // Lock entire family
      const family = await tx.select().from(assetsTable).where(or(eq(assetsTable.id, rootId), eq(assetsTable.parentAssetId, rootId)));
      const head = family.find(a => a.isCurrent) || family.reduce((max, a) => a.version > max.version ? a : max, family[0]);
      const nextVersion = Math.max(...family.map(a => a.version)) + 1;
      // Supersede every member: drop isCurrent + active statuses become superseded
      await tx.update(assetsTable).set({
        isCurrent: false,
        status: sql`CASE WHEN status IN ('approved','vendor_released','uploaded','under_review','revision_requested') THEN 'superseded' ELSE status END` as any,
        updatedAt: new Date(),
      } as any).where(or(eq(assetsTable.id, rootId), eq(assetsTable.parentAssetId, rootId)));
      const [row] = await tx.insert(assetsTable).values({
        title: head.title,
        fileUrl: parsed.data.fileUrl,
        fileName: parsed.data.fileName ?? null,
        mimeType: parsed.data.mimeType ?? null,
        fileSize: parsed.data.fileSize ?? null,
        category: head.category,
        visibility: head.visibility === "vendor_visible" ? "internal_only" : head.visibility, // never inherit vendor visibility — re-approval required
        partnerId: head.partnerId,
        eventId: head.eventId,
        orderId: head.orderId,
        productId: head.productId,
        packageId: head.packageId,
        brandingZoneId: head.brandingZoneId,
        supplierId: head.supplierId,
        ownerType: head.ownerType,
        ownerId: head.ownerId,
        parentAssetId: rootId,
        version: nextVersion,
        isCurrent: true,
        status: "uploaded",
        approvalStatus: "pending",
        productionReady: false,
        uploadedByUserId: parsed.data.uploadedByUserId ?? null,
        notes: parsed.data.notes ?? null,
        tagsJson: head.tagsJson,
      } as any).returning();
      // Carry over links from previous head (not necessarily the requested asset)
      const links = await tx.select().from(assetLinksTable).where(eq(assetLinksTable.assetId, head.id));
      if (links.length) {
        await tx.insert(assetLinksTable).values(links.map(l => ({ assetId: row.id, orderItemId: l.orderItemId, role: l.role, isRequiredFor: l.isRequiredFor })) as any);
      }
      return { row, headVersion: head.version };
    });
    await logEvent({ assetId: result.row.id, orderId: result.row.orderId ?? undefined, eventType: "new_version", fromValue: String(result.headVersion), toValue: String(result.row.version), actorUserId: parsed.data.uploadedByUserId ?? null });
    res.json(result.row);
  } catch (e: any) {
    res.status(500).json({ error: e.message || "new-version failed" });
  }
});

// ===== Link / unlink to order item =====
router.post("/assets/:id/links", async (req, res) => {
  const id = parseInt(req.params.id);
  const { orderItemId, role = "primary_artwork", isRequiredFor = false } = req.body || {};
  if (!orderItemId) return res.status(400).json({ error: "orderItemId required" });
  // De-dupe: same asset+item+role
  const existing = await db.select().from(assetLinksTable).where(and(eq(assetLinksTable.assetId, id), eq(assetLinksTable.orderItemId, orderItemId), eq(assetLinksTable.role, role)));
  if (existing.length) return res.json(existing[0]);
  const [row] = await db.insert(assetLinksTable).values({ assetId: id, orderItemId, role, isRequiredFor } as any).returning();
  await logEvent({ assetId: id, orderItemId, eventType: "linked", toValue: role });
  res.json(row);
});
router.delete("/assets/:id/links/:linkId", async (req, res) => {
  const id = parseInt(req.params.id);
  const linkId = parseInt(req.params.linkId);
  const [link] = await db.select().from(assetLinksTable).where(and(eq(assetLinksTable.id, linkId), eq(assetLinksTable.assetId, id)));
  if (!link) return res.status(404).json({ error: "Link not found for this asset" });
  await db.delete(assetLinksTable).where(eq(assetLinksTable.id, linkId));
  await logEvent({ assetId: id, orderItemId: link.orderItemId, eventType: "unlinked" });
  res.json({ success: true });
});

// ===== Delete =====
router.delete("/assets/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const [prev] = await db.select().from(assetsTable).where(eq(assetsTable.id, id));
  if (!prev) return res.status(404).json({ error: "Not found" });
  await db.delete(assetsTable).where(eq(assetsTable.id, id));
  await logEvent({ orderId: prev.orderId ?? undefined, eventType: "archived", fromValue: prev.title });
  res.json({ success: true });
});

// ===== Recent events feed =====
router.get("/asset-events", async (req, res) => {
  const limit = Math.min(parseInt((req.query.limit as string) || "50"), 200);
  const rows = await db.select().from(assetEventsTable).orderBy(desc(assetEventsTable.createdAt)).limit(limit);
  res.json(rows);
});

export { router as assetsRouter };
