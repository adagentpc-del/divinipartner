import { Router } from "express";
import { z } from "zod";
import {
  db, commercialAccountsTable, commercialPlansTable,
  proposalsTable, activationChecklistItemsTable,
} from "@workspace/db";
import { eq, desc, asc } from "drizzle-orm";
import {
  ACTIVATION_STATUSES, PROPOSAL_STATUSES, DEFAULT_CHECKLIST_TEMPLATE,
  seedActivationChecklist, getActivationProgress, advanceActivationStatus,
  buildPlanComparisonMatrix, getSalesPipelineSummary, listShowcasePresets,
} from "../services/salesEnablement";

const router = Router();

// ===== Pipeline summary =====
router.get("/sales/dashboard", async (_req, res) => {
  res.json(await getSalesPipelineSummary());
});

// ===== Showcase presets =====
router.get("/sales/showcase", (_req, res) => {
  res.json({ presets: listShowcasePresets() });
});

// ===== Proposals =====
const ProposalBody = z.object({
  accountId: z.number().int().nullable().optional(),
  prospectName: z.string().nullable().optional(),
  title: z.string().min(1),
  status: z.enum(PROPOSAL_STATUSES).optional(),
  recommendedPlanId: z.number().int().nullable().optional(),
  comparedPlanIds: z.array(z.number().int()).optional(),
  packagingNotes: z.string().nullable().optional(),
  internalNotes: z.string().nullable().optional(),
  prospectFacingNotes: z.string().nullable().optional(),
  createdBy: z.string().nullable().optional(),
});

router.get("/sales/proposals", async (_req, res) => {
  const rows = await db.select().from(proposalsTable).orderBy(desc(proposalsTable.createdAt));
  res.json(rows);
});

router.post("/sales/proposals", async (req, res) => {
  const parsed = ProposalBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
  const [row] = await db.insert(proposalsTable).values(parsed.data as any).returning();
  res.status(201).json(row);
});

router.get("/sales/proposals/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "bad id" });
  const [row] = await db.select().from(proposalsTable).where(eq(proposalsTable.id, id));
  if (!row) return res.status(404).json({ error: "not found" });
  const planIds = row.comparedPlanIds ?? [];
  const matrix = await buildPlanComparisonMatrix(planIds);
  let recommended: any = null;
  if (row.recommendedPlanId) {
    [recommended] = await db.select().from(commercialPlansTable).where(eq(commercialPlansTable.id, row.recommendedPlanId));
  }
  let account: any = null;
  if (row.accountId) {
    [account] = await db.select().from(commercialAccountsTable).where(eq(commercialAccountsTable.id, row.accountId));
  }
  res.json({ proposal: row, matrix, recommended, account });
});

router.patch("/sales/proposals/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "bad id" });
  const parsed = ProposalBody.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
  const patch: any = { ...parsed.data };
  // Auto-stamp transitions
  if (parsed.data.status === "sent") patch.sentAt = new Date();
  if (parsed.data.status === "accepted" || parsed.data.status === "declined") patch.decidedAt = new Date();
  const [row] = await db.update(proposalsTable).set(patch).where(eq(proposalsTable.id, id)).returning();
  res.json(row);
});

router.delete("/sales/proposals/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "bad id" });
  await db.delete(proposalsTable).where(eq(proposalsTable.id, id));
  res.json({ ok: true });
});

// Comparison matrix without saving a proposal (ad-hoc)
router.post("/sales/comparison-matrix", async (req, res) => {
  const planIds = z.array(z.number().int()).safeParse(req.body?.planIds);
  if (!planIds.success) return res.status(400).json({ error: planIds.error.message });
  res.json(await buildPlanComparisonMatrix(planIds.data));
});

// ===== Activation =====
router.get("/sales/accounts/:id/activation", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "bad id" });
  const [account] = await db.select().from(commercialAccountsTable).where(eq(commercialAccountsTable.id, id));
  if (!account) return res.status(404).json({ error: "not found" });
  const progress = await getActivationProgress(id);
  res.json({ account, progress, template: DEFAULT_CHECKLIST_TEMPLATE });
});

router.post("/sales/accounts/:id/activation/seed", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "bad id" });
  await seedActivationChecklist(id);
  res.json(await getActivationProgress(id));
});

const ItemPatchBody = z.object({
  status: z.enum(["pending", "in_progress", "done", "skipped"]).optional(),
  assignedTo: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

router.patch("/sales/activation-items/:itemId", async (req, res) => {
  const itemId = parseInt(req.params.itemId);
  if (isNaN(itemId)) return res.status(400).json({ error: "bad id" });
  const parsed = ItemPatchBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
  const patch: any = { ...parsed.data };
  if (parsed.data.status === "done" || parsed.data.status === "skipped") patch.completedAt = new Date();
  if (parsed.data.status === "pending" || parsed.data.status === "in_progress") patch.completedAt = null;
  const [row] = await db.update(activationChecklistItemsTable).set(patch).where(eq(activationChecklistItemsTable.id, itemId)).returning();
  res.json(row);
});

router.post("/sales/accounts/:id/activation/advance", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "bad id" });
  const target = z.enum(ACTIVATION_STATUSES).safeParse(req.body?.status);
  if (!target.success) return res.status(400).json({ error: "invalid status" });
  const result = await advanceActivationStatus(id, target.data);
  if (!result.ok) return res.status(400).json({ error: result.error });
  res.json(result.account);
});

// Demo-mode toggle is purely client-side (localStorage), but we expose the constants
router.get("/sales/constants", (_req, res) => {
  res.json({ activationStatuses: ACTIVATION_STATUSES, proposalStatuses: PROPOSAL_STATUSES });
});

export default router;
