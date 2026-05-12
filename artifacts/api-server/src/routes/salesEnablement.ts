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
import {
  GetSalesDashboardResponse,
  GetSalesShowcaseResponse,
  ListSalesProposalsResponse,
  GetSalesProposalResponse,
  UpdateSalesProposalResponse,
  DeleteSalesProposalResponse,
  BuildSalesComparisonMatrixResponse,
  GetSalesAccountActivationResponse,
  SeedSalesAccountActivationResponse,
  UpdateSalesActivationItemResponse,
  AdvanceSalesAccountActivationResponse,
  GetSalesConstantsResponse,
} from "@workspace/api-zod";
import { sendValidated } from "../lib/validateResponse";

const router = Router();

// ===== Pipeline summary =====
router.get("/sales/dashboard", async (req, res) => {
  sendValidated(req, res, GetSalesDashboardResponse, await getSalesPipelineSummary(), "Get sales dashboard");
});

// ===== Showcase presets =====
router.get("/sales/showcase", (req, res) => {
  sendValidated(req, res, GetSalesShowcaseResponse, { presets: listShowcasePresets() }, "Get sales showcase");
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

router.get("/sales/proposals", async (req, res) => {
  const rows = await db.select().from(proposalsTable).orderBy(desc(proposalsTable.createdAt));
  sendValidated(req, res, ListSalesProposalsResponse, rows, "List sales proposals");
});

router.post("/sales/proposals", async (req, res) => {
  const parsed = ProposalBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [row] = await db.insert(proposalsTable).values(parsed.data as any).returning();
  res.status(201).json(row);
});

router.get("/sales/proposals/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "bad id" }); return; }
  const [row] = await db.select().from(proposalsTable).where(eq(proposalsTable.id, id));
  if (!row) { res.status(404).json({ error: "not found" }); return; }
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
  sendValidated(req, res, GetSalesProposalResponse, { proposal: row, matrix, recommended, account }, "Get sales proposal");
});

router.patch("/sales/proposals/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "bad id" }); return; }
  const parsed = ProposalBody.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const patch: any = { ...parsed.data };
  // Auto-stamp transitions
  if (parsed.data.status === "sent") patch.sentAt = new Date();
  if (parsed.data.status === "accepted" || parsed.data.status === "declined") patch.decidedAt = new Date();
  const [row] = await db.update(proposalsTable).set(patch).where(eq(proposalsTable.id, id)).returning();
  sendValidated(req, res, UpdateSalesProposalResponse, row, "Update sales proposal");
});

router.delete("/sales/proposals/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "bad id" }); return; }
  await db.delete(proposalsTable).where(eq(proposalsTable.id, id));
  sendValidated(req, res, DeleteSalesProposalResponse, { ok: true }, "Delete sales proposal");
});

// Comparison matrix without saving a proposal (ad-hoc)
router.post("/sales/comparison-matrix", async (req, res) => {
  const planIds = z.array(z.number().int()).safeParse(req.body?.planIds);
  if (!planIds.success) { res.status(400).json({ error: planIds.error.message }); return; }
  sendValidated(req, res, BuildSalesComparisonMatrixResponse, await buildPlanComparisonMatrix(planIds.data), "Build sales comparison matrix");
});

// ===== Activation =====
router.get("/sales/accounts/:id/activation", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "bad id" }); return; }
  const [account] = await db.select().from(commercialAccountsTable).where(eq(commercialAccountsTable.id, id));
  if (!account) { res.status(404).json({ error: "not found" }); return; }
  const progress = await getActivationProgress(id);
  sendValidated(req, res, GetSalesAccountActivationResponse, { account, progress, template: DEFAULT_CHECKLIST_TEMPLATE }, "Get sales account activation");
});

router.post("/sales/accounts/:id/activation/seed", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "bad id" }); return; }
  await seedActivationChecklist(id);
  sendValidated(req, res, SeedSalesAccountActivationResponse, await getActivationProgress(id), "Seed sales account activation");
});

const ItemPatchBody = z.object({
  status: z.enum(["pending", "in_progress", "done", "skipped"]).optional(),
  assignedTo: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

router.patch("/sales/activation-items/:itemId", async (req, res) => {
  const itemId = parseInt(req.params.itemId);
  if (isNaN(itemId)) { res.status(400).json({ error: "bad id" }); return; }
  const parsed = ItemPatchBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const patch: any = { ...parsed.data };
  if (parsed.data.status === "done" || parsed.data.status === "skipped") patch.completedAt = new Date();
  if (parsed.data.status === "pending" || parsed.data.status === "in_progress") patch.completedAt = null;
  const [row] = await db.update(activationChecklistItemsTable).set(patch).where(eq(activationChecklistItemsTable.id, itemId)).returning();
  sendValidated(req, res, UpdateSalesActivationItemResponse, row, "Update sales activation item");
});

router.post("/sales/accounts/:id/activation/advance", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "bad id" }); return; }
  const target = z.enum(ACTIVATION_STATUSES).safeParse(req.body?.status);
  if (!target.success) { res.status(400).json({ error: "invalid status" }); return; }
  const result = await advanceActivationStatus(id, target.data);
  if (!result.ok) { res.status(400).json({ error: result.error }); return; }
  sendValidated(req, res, AdvanceSalesAccountActivationResponse, result.account, "Advance sales account activation");
});

// Demo-mode toggle is purely client-side (localStorage), but we expose the constants
router.get("/sales/constants", (req, res) => {
  sendValidated(req, res, GetSalesConstantsResponse, { activationStatuses: ACTIVATION_STATUSES, proposalStatuses: PROPOSAL_STATUSES }, "Get sales constants");
});

export default router;
