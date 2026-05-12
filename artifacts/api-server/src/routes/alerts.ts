import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { getAuth } from "@clerk/express";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, partnersTable, assetsTable, usageEvents } from "@workspace/db";
import { computeAlerts, summarizeAlerts, routeAlertToSms } from "../lib/alerts";
import { sendValidated } from "../lib/validateResponse.js";
import {
  ListAdminAlertsResponse,
  GetAdminAlertsSummaryResponse,
  GetPartnerAlertsResponse,
  GetOrderAlertsResponse,
  ResolveManualFollowupResponse,
  ResolveSupportIssueResponse,
  ArchivePartnerResponse,
  UnarchivePartnerResponse,
  ArchiveAssetResponse,
  UnarchiveAssetResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const auth = getAuth(req);
  if (!auth?.userId) { res.status(401).json({ error: "Authentication required" }); return; }
  next();
}
router.use("/admin/alerts", requireAuth);
router.use("/admin/support-issues", requireAuth);
router.use("/admin/partners/:id/archive", requireAuth);
router.use("/admin/partners/:id/unarchive", requireAuth);
router.use("/admin/assets/:id/archive", requireAuth);
router.use("/admin/assets/:id/unarchive", requireAuth);

// GET /api/admin/alerts — full derived alerts list (with optional filters).
router.get("/admin/alerts", async (req, res): Promise<void> => {
  const partnerId = req.query.partnerId ? Number(req.query.partnerId) : undefined;
  const orderId = req.query.orderId ? Number(req.query.orderId) : undefined;
  const alerts = await computeAlerts({ partnerId, orderId });
  sendValidated(req, res, ListAdminAlertsResponse, { alerts, summary: summarizeAlerts(alerts) }, "listAdminAlerts");
});

// Lightweight summary for badges/banners — same compute, smaller payload.
router.get("/admin/alerts/summary", async (req, res): Promise<void> => {
  const alerts = await computeAlerts();
  sendValidated(req, res, GetAdminAlertsSummaryResponse, { summary: summarizeAlerts(alerts), top: alerts.slice(0, 5) }, "getAdminAlertsSummary");
});

// Per-partner alerts shortcut — also surfaces inactive/archive context.
router.get("/admin/alerts/partner/:partnerId", async (req, res): Promise<void> => {
  const partnerId = Number(req.params.partnerId);
  if (!Number.isFinite(partnerId)) { res.status(400).json({ error: "Invalid partnerId" }); return; }
  const alerts = await computeAlerts({ partnerId });
  sendValidated(req, res, GetPartnerAlertsResponse, { alerts, summary: summarizeAlerts(alerts) }, "getPartnerAlerts");
});

// Per-order alerts shortcut — used by OrderDetail.
router.get("/admin/alerts/order/:orderId", async (req, res): Promise<void> => {
  const orderId = Number(req.params.orderId);
  if (!Number.isFinite(orderId)) { res.status(400).json({ error: "Invalid orderId" }); return; }
  const alerts = await computeAlerts({ orderId });
  sendValidated(req, res, GetOrderAlertsResponse, { alerts, summary: summarizeAlerts(alerts) }, "getOrderAlerts");
});

// ---- Manual follow-up flag (sticky reminder) ---------------------------
const FollowupBody = z.object({
  partnerId: z.number().int().positive().optional(),
  orderId: z.number().int().positive().optional(),
  title: z.string().min(1),
  note: z.string().optional(),
});
router.post("/admin/alerts/manual-followup", async (req, res): Promise<void> => {
  const parsed = FollowupBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid body", details: parsed.error.format() }); return; }
  const { partnerId, orderId, title, note } = parsed.data;
  const [row] = await db.insert(usageEvents).values({
    eventType: "alert.manual_followup",
    partnerId: partnerId ?? null,
    objectType: orderId ? "order" : null,
    objectId: orderId ?? null,
    meta: { title, note: note ?? null, createdBy: getAuth(req).userId, resolved: false } as any,
  }).returning();
  res.status(201).json({ id: row.id });
});

router.post("/admin/alerts/manual-followup/:id/resolve", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [existing] = await db.select().from(usageEvents).where(eq(usageEvents.id, id));
  if (!existing || existing.eventType !== "alert.manual_followup") { res.status(404).json({ error: "Not found" }); return; }
  await db.update(usageEvents).set({ meta: { ...((existing.meta as any) || {}), resolved: true, resolvedBy: getAuth(req).userId, resolvedAt: new Date().toISOString() } as any }).where(eq(usageEvents.id, id));
  sendValidated(req, res, ResolveManualFollowupResponse, { ok: true }, "resolveManualFollowup");
});

// ---- Support issue submission (lightweight prep for chatbot/issue handoff)
const IssueBody = z.object({
  partnerId: z.number().int().positive().optional(),
  subject: z.string().min(1).max(200),
  body: z.string().max(4000).optional(),
  severity: z.enum(["info", "warning", "critical"]).optional(),
  channel: z.string().max(40).optional(), // "chatbot" | "portal" | "email" | etc.
  contactPhone: z.string().max(40).optional(),
});
router.post("/admin/support-issues", async (req, res): Promise<void> => {
  const parsed = IssueBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid body", details: parsed.error.format() }); return; }
  const issueId = `iss_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const meta = {
    issueId, subject: parsed.data.subject, body: parsed.data.body ?? null,
    severity: parsed.data.severity ?? "warning",
    channel: parsed.data.channel ?? "manual",
    contactPhone: parsed.data.contactPhone ?? null,
    createdBy: getAuth(req).userId,
  };
  const [row] = await db.insert(usageEvents).values({
    eventType: "support.issue_submitted",
    partnerId: parsed.data.partnerId ?? null,
    objectType: null, objectId: null,
    meta: meta as any,
  }).returning();

  // Future text-to-phone path: invoked unconditionally so we have an audit trail
  // of routing decisions; the SMS function itself is currently a no-op stub.
  if (parsed.data.severity === "critical" && parsed.data.contactPhone) {
    await routeAlertToSms({
      key: `support_issue:${row.id}`, type: "unresolved_support_issue",
      severity: "critical", title: parsed.data.subject, detail: parsed.data.body ?? "",
      partnerId: parsed.data.partnerId ?? null, partnerName: null,
      orderId: null, assetId: null, link: null,
      occurredAt: new Date(), meta,
    }, { recipient: parsed.data.contactPhone, reason: "critical_support_issue" });
  }
  res.status(201).json({ id: row.id, issueId });
});

router.post("/admin/support-issues/:issueId/resolve", async (req, res): Promise<void> => {
  const issueId = req.params.issueId;
  if (!issueId) { res.status(400).json({ error: "Missing issueId" }); return; }
  await db.insert(usageEvents).values({
    eventType: "support.issue_resolved",
    partnerId: null, objectType: null, objectId: null,
    meta: { issueId, resolvedBy: getAuth(req).userId } as any,
  });
  sendValidated(req, res, ResolveSupportIssueResponse, { ok: true }, "resolveSupportIssue");
});

// ---- Partner archive / unarchive ---------------------------------------
const ArchiveBody = z.object({ reason: z.string().max(500).optional() });
router.post("/admin/partners/:id/archive", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const parsed = ArchiveBody.safeParse(req.body || {});
  const reason = parsed.success ? parsed.data.reason ?? null : null;
  const [row] = await db.update(partnersTable).set({
    archivedAt: new Date(),
    archivedReason: reason,
  }).where(eq(partnersTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  sendValidated(req, res, ArchivePartnerResponse, { ok: true, partner: row }, "archivePartner");
});
router.post("/admin/partners/:id/unarchive", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [row] = await db.update(partnersTable).set({
    archivedAt: null,
    archivedReason: null,
  }).where(eq(partnersTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  sendValidated(req, res, UnarchivePartnerResponse, { ok: true, partner: row }, "unarchivePartner");
});

// ---- Asset archive / unarchive (uses existing assets.status) -----------
router.post("/admin/assets/:id/archive", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [row] = await db.update(assetsTable).set({ status: "archived", isCurrent: false }).where(eq(assetsTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  sendValidated(req, res, ArchiveAssetResponse, { ok: true, asset: row }, "archiveAsset");
});
router.post("/admin/assets/:id/unarchive", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [row] = await db.update(assetsTable).set({ status: "uploaded" }).where(eq(assetsTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  sendValidated(req, res, UnarchiveAssetResponse, { ok: true, asset: row }, "unarchiveAsset");
});

export default router;
