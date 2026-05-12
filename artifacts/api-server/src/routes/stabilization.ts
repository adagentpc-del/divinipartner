// @ts-nocheck
import { Router } from "express";
import { z } from "zod";
import {
  db, objectionsTable, demoFollowupsTable, faqEntriesTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  listObjections, getObjectionSummary, OBJECTION_CATEGORIES, OBJECTION_STATUSES, RECOMMENDED_RESPONSES,
} from "../services/objections";
import { computeAccountBlockers, getStabilizationDashboard } from "../services/rolloutStabilization";
import { listFaq, FAQ_AUDIENCES, FAQ_CATEGORIES } from "../services/faq";
import {
  ListObjectionsResponse, CreateObjectionResponse, GetObjectionsSummaryResponse, GetObjectionsConstantsResponse,
  GetObjectionResponse, UpdateObjectionResponse, DeleteObjectionResponse,
  ListDemoFollowupsResponse, CreateDemoFollowupResponse, GetDemoFollowupResponse, UpdateDemoFollowupResponse, DeleteDemoFollowupResponse,
  ListFaqResponse, GetFaqConstantsResponse, CreateFaqResponse, UpdateFaqResponse, DeleteFaqResponse,
  GetStabilizationRolloutResponse, GetAccountBlockersResponse,
} from "@workspace/api-zod";
import { sendValidated } from "../lib/validateResponse";

const router = Router();

// =============== OBJECTIONS ===============
router.get("/objections", async (req, res) => {
  const rows = await listObjections({
    status: req.query.status as string | undefined,
    category: req.query.category as string | undefined,
    accountId: req.query.accountId ? Number(req.query.accountId) : undefined,
    proposalId: req.query.proposalId ? Number(req.query.proposalId) : undefined,
  });
  sendValidated(req, res, ListObjectionsResponse, rows, "Objections list");
});

router.get("/objections/summary", async (req, res) => {
  sendValidated(req, res, GetObjectionsSummaryResponse, await getObjectionSummary(), "Objections summary");
});

router.get("/objections/constants", (req, res) => {
  sendValidated(req, res, GetObjectionsConstantsResponse, { categories: OBJECTION_CATEGORIES, statuses: OBJECTION_STATUSES, recommendedResponses: RECOMMENDED_RESPONSES }, "Objections constants");
});

const ObjectionBody = z.object({
  accountId: z.number().nullable().optional(),
  proposalId: z.number().nullable().optional(),
  scenarioKey: z.string().nullable().optional(),
  category: z.string(),
  summary: z.string().min(1),
  detail: z.string().nullable().optional(),
  status: z.string().optional(),
  recommendedResponse: z.string().nullable().optional(),
  internalNotes: z.string().nullable().optional(),
  tagsJson: z.array(z.string()).optional(),
  raisedBy: z.string().nullable().optional(),
});

router.post("/objections", async (req, res) => {
  const parsed = ObjectionBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
  const data: any = { ...parsed.data };
  if (!data.recommendedResponse && RECOMMENDED_RESPONSES[data.category]) {
    data.recommendedResponse = RECOMMENDED_RESPONSES[data.category];
  }
  const [row] = await db.insert(objectionsTable).values(data).returning();
  sendValidated(req, res, CreateObjectionResponse, row, "Objection create");
});

router.get("/objections/:id", async (req, res) => {
  const [row] = await db.select().from(objectionsTable).where(eq(objectionsTable.id, Number(req.params.id)));
  if (!row) return res.status(404).json({ error: "not found" });
  sendValidated(req, res, GetObjectionResponse, row, "Objection get");
});

router.patch("/objections/:id", async (req, res) => {
  const parsed = ObjectionBody.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
  const data: any = { ...parsed.data };
  if (data.status === "resolved" && !data.resolvedAt) data.resolvedAt = new Date();
  const [row] = await db.update(objectionsTable).set(data).where(eq(objectionsTable.id, Number(req.params.id))).returning();
  sendValidated(req, res, UpdateObjectionResponse, row, "Objection update");
});

router.delete("/objections/:id", async (req, res) => {
  await db.delete(objectionsTable).where(eq(objectionsTable.id, Number(req.params.id)));
  sendValidated(req, res, DeleteObjectionResponse, { ok: true }, "Objection delete");
});

// =============== DEMO FOLLOW-UPS ===============
const FollowupBody = z.object({
  accountId: z.number().nullable().optional(),
  prospectName: z.string().nullable().optional(),
  demoAt: z.string().nullable().optional(),
  outcome: z.string().nullable().optional(),
  status: z.string().optional(),
  interestAreas: z.array(z.string()).optional(),
  objectionsSummary: z.string().nullable().optional(),
  recommendedPlanId: z.number().nullable().optional(),
  whiteLabelInterest: z.string().nullable().optional(),
  activationReadiness: z.string().nullable().optional(),
  nextStep: z.string().nullable().optional(),
  priorityFeatures: z.array(z.string()).optional(),
  internalNotes: z.string().nullable().optional(),
  loggedBy: z.string().nullable().optional(),
});

router.get("/demo-followups", async (req, res) => {
  const where: any[] = [];
  if (req.query.status) where.push(eq(demoFollowupsTable.status, req.query.status as string));
  if (req.query.accountId) where.push(eq(demoFollowupsTable.accountId, Number(req.query.accountId)));
  const q = db.select().from(demoFollowupsTable);
  const { and, desc } = await import("drizzle-orm");
  const rows = where.length ? await q.where(and(...where)).orderBy(desc(demoFollowupsTable.createdAt)) : await q.orderBy(desc(demoFollowupsTable.createdAt));
  sendValidated(req, res, ListDemoFollowupsResponse, rows, "Demo followups list");
});

router.post("/demo-followups", async (req, res) => {
  const parsed = FollowupBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
  const data: any = { ...parsed.data };
  if (data.demoAt) data.demoAt = new Date(data.demoAt);
  const [row] = await db.insert(demoFollowupsTable).values(data).returning();
  sendValidated(req, res, CreateDemoFollowupResponse, row, "Demo followup create");
});

router.get("/demo-followups/:id", async (req, res) => {
  const [row] = await db.select().from(demoFollowupsTable).where(eq(demoFollowupsTable.id, Number(req.params.id)));
  if (!row) return res.status(404).json({ error: "not found" });
  sendValidated(req, res, GetDemoFollowupResponse, row, "Demo followup get");
});

router.patch("/demo-followups/:id", async (req, res) => {
  const parsed = FollowupBody.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
  const data: any = { ...parsed.data };
  if (data.demoAt) data.demoAt = new Date(data.demoAt);
  const [row] = await db.update(demoFollowupsTable).set(data).where(eq(demoFollowupsTable.id, Number(req.params.id))).returning();
  sendValidated(req, res, UpdateDemoFollowupResponse, row, "Demo followup update");
});

router.delete("/demo-followups/:id", async (req, res) => {
  await db.delete(demoFollowupsTable).where(eq(demoFollowupsTable.id, Number(req.params.id)));
  sendValidated(req, res, DeleteDemoFollowupResponse, { ok: true }, "Demo followup delete");
});

// =============== FAQ ===============
router.get("/faq", async (req, res) => {
  const rows = await listFaq({
    audience: req.query.audience as string | undefined,
    category: req.query.category as string | undefined,
    activeOnly: req.query.activeOnly === "true",
  });
  sendValidated(req, res, ListFaqResponse, rows, "FAQ list");
});

router.get("/faq/constants", (req, res) => {
  sendValidated(req, res, GetFaqConstantsResponse, { audiences: FAQ_AUDIENCES, categories: FAQ_CATEGORIES }, "FAQ constants");
});

const FaqBody = z.object({
  audience: z.string(),
  category: z.string(),
  question: z.string().min(1),
  answer: z.string().min(1),
  sortOrder: z.number().optional(),
  isActive: z.boolean().optional(),
});

router.post("/faq", async (req, res) => {
  const parsed = FaqBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
  const [row] = await db.insert(faqEntriesTable).values(parsed.data).returning();
  sendValidated(req, res, CreateFaqResponse, row, "FAQ create");
});

router.patch("/faq/:id", async (req, res) => {
  const parsed = FaqBody.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
  const [row] = await db.update(faqEntriesTable).set(parsed.data).where(eq(faqEntriesTable.id, Number(req.params.id))).returning();
  sendValidated(req, res, UpdateFaqResponse, row, "FAQ update");
});

router.delete("/faq/:id", async (req, res) => {
  await db.delete(faqEntriesTable).where(eq(faqEntriesTable.id, Number(req.params.id)));
  sendValidated(req, res, DeleteFaqResponse, { ok: true }, "FAQ delete");
});

// =============== ROLLOUT STABILIZATION ===============
router.get("/rollout/stabilization", async (req, res) => {
  sendValidated(req, res, GetStabilizationRolloutResponse, await getStabilizationDashboard(), "Stabilization rollout");
});

router.get("/rollout/account/:id/blockers", async (req, res) => {
  try {
    sendValidated(req, res, GetAccountBlockersResponse, await computeAccountBlockers(Number(req.params.id)), "Account blockers");
  } catch (e: any) {
    res.status(404).json({ error: e.message });
  }
});

export default router;
