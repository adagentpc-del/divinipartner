import { Router } from "express";
import { z } from "zod";
import { db, feedbackItems, usageEvents, partnersTable } from "@workspace/db";
import { and, desc, eq, gte, count, ne } from "drizzle-orm";
import { emit, summary as usageSummary, timeline as usageTimeline } from "../services/usageTracking";
import { computePartnerHealth, listAllPartnerHealth } from "../services/partnerHealth";

const router = Router();

// ---- Usage ----
router.get("/usage/summary", async (req, res) => {
  const partnerId = req.query.partnerId ? parseInt(String(req.query.partnerId)) : undefined;
  const role = req.query.role ? String(req.query.role) : undefined;
  const since = req.query.since ? new Date(String(req.query.since)) : undefined;
  const until = req.query.until ? new Date(String(req.query.until)) : undefined;
  res.json(await usageSummary({ partnerId, role, since, until }));
});

router.get("/usage/timeline", async (req, res) => {
  const partnerId = req.query.partnerId ? parseInt(String(req.query.partnerId)) : undefined;
  const limit = req.query.limit ? parseInt(String(req.query.limit)) : 100;
  res.json(await usageTimeline(limit, partnerId));
});

router.post("/usage/emit", async (req, res) => {
  const Body = z.object({
    eventType: z.string(),
    partnerId: z.number().nullable().optional(),
    userId: z.string().nullable().optional(),
    role: z.string().nullable().optional(),
    objectType: z.string().nullable().optional(),
    objectId: z.number().nullable().optional(),
    meta: z.record(z.any()).nullable().optional(),
  });
  const parsed = Body.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  await emit(parsed.data.eventType, parsed.data);
  res.json({ ok: true });
});

// ---- Feedback ----
router.get("/feedback", async (req, res) => {
  const conds: any[] = [];
  if (req.query.status) conds.push(eq(feedbackItems.status, String(req.query.status)));
  if (req.query.partnerId) conds.push(eq(feedbackItems.partnerId, parseInt(String(req.query.partnerId))));
  if (req.query.category) conds.push(eq(feedbackItems.category, String(req.query.category)));
  const where = conds.length ? and(...conds) : undefined;
  const rows = await db.select().from(feedbackItems).where(where as any).orderBy(desc(feedbackItems.createdAt)).limit(200);
  res.json(rows);
});

router.post("/feedback", async (req, res) => {
  const Body = z.object({
    submitterUserId: z.string().nullable().optional(),
    submitterRole: z.string().nullable().optional(),
    partnerId: z.number().nullable().optional(),
    screenPath: z.string().nullable().optional().refine(
      (v) => !v || /^\/[^\s]*$/.test(v),
      "screenPath must be a relative path starting with /",
    ),
    category: z.string().default("other"),
    severity: z.string().default("medium"),
    message: z.string().min(1),
    tags: z.array(z.string()).optional(),
  });
  const parsed = Body.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [row] = await db.insert(feedbackItems).values({ ...parsed.data, tags: parsed.data.tags ?? null }).returning();
  emit("feedback.submitted", { partnerId: parsed.data.partnerId ?? null, userId: parsed.data.submitterUserId ?? null, role: parsed.data.submitterRole ?? null, objectType: "feedback", objectId: row.id, meta: { category: row.category, severity: row.severity } }).catch(() => {});
  res.status(201).json(row);
});

router.patch("/feedback/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "bad id" }); return; }
  const Body = z.object({
    status: z.string().optional(),
    severity: z.string().optional(),
    category: z.string().optional(),
    tags: z.array(z.string()).optional(),
    assignedToUserId: z.string().nullable().optional(),
    internalNotes: z.string().nullable().optional(),
  });
  const parsed = Body.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const update: any = { ...parsed.data, updatedAt: new Date() };
  if (parsed.data.status === "resolved") update.resolvedAt = new Date();
  const [row] = await db.update(feedbackItems).set(update).where(eq(feedbackItems.id, id)).returning();
  res.json(row);
});

router.delete("/feedback/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  await db.delete(feedbackItems).where(eq(feedbackItems.id, id));
  res.json({ ok: true });
});

// ---- Partner Health ----
router.get("/partner-health", async (_req, res) => {
  res.json(await listAllPartnerHealth());
});

router.get("/partner-health/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const h = await computePartnerHealth(id);
  if (!h) { res.status(404).json({ error: "Not found" }); return; }
  res.json(h);
});

// ---- Post-Launch Dashboard ----
router.get("/post-launch/dashboard", async (_req, res) => {
  const allPartners = await db.select().from(partnersTable);
  const launchedCount = allPartners.filter(p => p.launchStatus === "live").length;
  const draftCount = allPartners.filter(p => !p.launchStatus || p.launchStatus === "draft").length;
  const pausedCount = allPartners.filter(p => p.launchStatus === "paused").length;

  const health = await listAllPartnerHealth();
  const distribution: Record<string, number> = {};
  for (const h of health) distribution[h.status] = (distribution[h.status] || 0) + 1;

  const partnersWithFirstOrder = health.filter(h => h.metrics.firstOrderAt).length;
  const partnersStalled = health.filter(h => h.status === "onboarding" && h.launchStatus === "draft").length;
  const liveButInactive = health.filter(h => h.launchStatus === "live" && !h.metrics.firstOrderAt).length;

  const launchTimes = health.filter(h => h.metrics.launchedAt).map(h => {
    const created = allPartners.find(p => p.id === h.partnerId)?.createdAt;
    if (!created) return null;
    return (new Date(h.metrics.launchedAt!).getTime() - new Date(created).getTime()) / (24 * 60 * 60 * 1000);
  }).filter((x): x is number => x !== null);
  const avgTimeToLaunchDays = launchTimes.length ? Math.round(launchTimes.reduce((a, b) => a + b, 0) / launchTimes.length) : null;

  const timeToFirstOrders = health.map(h => h.metrics.timeToFirstOrderDays).filter((x): x is number => x !== null && x >= 0);
  const avgTimeToFirstOrderDays = timeToFirstOrders.length ? Math.round(timeToFirstOrders.reduce((a, b) => a + b, 0) / timeToFirstOrders.length) : null;

  // Feedback summary
  const [feedbackOpen] = await db.select({ c: count() }).from(feedbackItems).where(ne(feedbackItems.status, "resolved"));
  const feedbackByCategory = await db.select({
    category: feedbackItems.category,
    c: count(),
  }).from(feedbackItems).groupBy(feedbackItems.category);

  // Recent activity
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const recentByType = await db.select({
    eventType: usageEvents.eventType,
    c: count(),
  }).from(usageEvents).where(gte(usageEvents.occurredAt, since)).groupBy(usageEvents.eventType).orderBy(desc(count())).limit(15);

  res.json({
    partners: {
      total: allPartners.length,
      launched: launchedCount,
      draft: draftCount,
      paused: pausedCount,
      partnersWithFirstOrder,
      partnersStalled,
      liveButInactive,
    },
    healthDistribution: distribution,
    metrics: {
      avgTimeToLaunchDays,
      avgTimeToFirstOrderDays,
    },
    feedback: {
      open: feedbackOpen.c,
      byCategory: feedbackByCategory,
    },
    recentActivity: recentByType,
    health: health.slice(0, 50),
  });
});

export default router;
