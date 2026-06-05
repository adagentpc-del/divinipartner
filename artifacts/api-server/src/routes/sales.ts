import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod/v4";
import { and, desc, eq, sql } from "drizzle-orm";
import {
  db,
  salesRepsTable,
  salesAccountsTable,
  salesIntakeSubmissionsTable,
  salesOpportunitiesTable,
  salesOpportunityNotesTable,
  OPPORTUNITY_STAGES,
  OPPORTUNITY_LOST_REASONS,
  SALES_REP_ROLES,
  SALES_REP_STATUSES,
  SALES_ACCOUNT_STATUSES,
  INTAKE_FORM_TYPES,
  INTAKE_LINK_SOURCES,
  type SalesRep,
} from "@workspace/db";
import {
  requireSalesUser,
  requireSuperAdmin,
  getSalesUser,
} from "../middlewares/requireSalesUser.js";
import { normalizeCompanyName, findBestAccountMatch } from "../lib/salesMatching.js";
import { sendIntakeRoutedNotification } from "../lib/salesEmail.js";

const router: IRouter = Router();

// ───────────────────────────────────────────────────────────────────────
// Identity
// ───────────────────────────────────────────────────────────────────────

// Who am I in the sales module? Drives role-aware UI (rep vs super admin) and
// row-level scoping on the client. 403 means the signed-in user has no sales
// access at all.
router.get("/sales/me", requireSalesUser(), (_req, res) => {
  res.json(getSalesUser(res));
});

// ───────────────────────────────────────────────────────────────────────
// Sales Team (reps) — Super Admin only
// ───────────────────────────────────────────────────────────────────────

const repBodySchema = z.object({
  firstName: z.string().trim().min(1, "First name is required"),
  lastName: z.string().trim().min(1, "Last name is required"),
  email: z.string().trim().toLowerCase().email("Valid email is required"),
  phone: z.string().trim().optional().nullable(),
  role: z.enum(SALES_REP_ROLES).default("sales_rep"),
  status: z.enum(SALES_REP_STATUSES).default("active"),
  notificationEmail: z.string().trim().toLowerCase().email().optional().nullable(),
  notes: z.string().trim().optional().nullable(),
});

router.get("/sales/reps", requireSuperAdmin(), async (_req, res) => {
  const reps = await db.select().from(salesRepsTable).orderBy(salesRepsTable.firstName);
  res.json(reps);
});

router.post("/sales/reps", requireSuperAdmin(), async (req: Request, res: Response) => {
  const parsed = repBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid rep data" });
    return;
  }
  const data = parsed.data;
  const [existing] = await db
    .select({ id: salesRepsTable.id })
    .from(salesRepsTable)
    .where(sql`lower(${salesRepsTable.email}) = ${data.email}`)
    .limit(1);
  if (existing) {
    res.status(409).json({ error: "A team member with this email already exists." });
    return;
  }
  const [rep] = await db
    .insert(salesRepsTable)
    .values({
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email,
      phone: data.phone ?? null,
      role: data.role,
      status: data.status,
      notificationEmail: data.notificationEmail ?? null,
      notes: data.notes ?? null,
    })
    .returning();
  res.status(201).json(rep);
});

router.patch("/sales/reps/:id", requireSuperAdmin(), async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const parsed = repBodySchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid rep data" });
    return;
  }
  const data = parsed.data;
  if (data.email) {
    const [conflict] = await db
      .select({ id: salesRepsTable.id })
      .from(salesRepsTable)
      .where(and(sql`lower(${salesRepsTable.email}) = ${data.email}`, sql`${salesRepsTable.id} <> ${id}`))
      .limit(1);
    if (conflict) {
      res.status(409).json({ error: "Another team member already uses this email." });
      return;
    }
  }
  const [rep] = await db
    .update(salesRepsTable)
    .set({
      ...(data.firstName !== undefined ? { firstName: data.firstName } : {}),
      ...(data.lastName !== undefined ? { lastName: data.lastName } : {}),
      ...(data.email !== undefined ? { email: data.email } : {}),
      ...(data.phone !== undefined ? { phone: data.phone } : {}),
      ...(data.role !== undefined ? { role: data.role } : {}),
      ...(data.status !== undefined ? { status: data.status } : {}),
      ...(data.notificationEmail !== undefined ? { notificationEmail: data.notificationEmail } : {}),
      ...(data.notes !== undefined ? { notes: data.notes } : {}),
    })
    .where(eq(salesRepsTable.id, id))
    .returning();
  if (!rep) {
    res.status(404).json({ error: "Team member not found" });
    return;
  }
  res.json(rep);
});

// ───────────────────────────────────────────────────────────────────────
// Accounts — Super Admin manages; reps see the accounts they own
// ───────────────────────────────────────────────────────────────────────

const fileSchema = z.object({ name: z.string(), url: z.string() });

const accountBodySchema = z.object({
  companyName: z.string().trim().min(1, "Company name is required"),
  parentCompany: z.string().trim().optional().nullable(),
  contactName: z.string().trim().optional().nullable(),
  contactEmail: z.string().trim().optional().nullable(),
  contactPhone: z.string().trim().optional().nullable(),
  website: z.string().trim().optional().nullable(),
  industry: z.string().trim().optional().nullable(),
  ownerRepId: z.number().int().optional().nullable(),
  status: z.enum(SALES_ACCOUNT_STATUSES).default("prospect"),
  notes: z.string().trim().optional().nullable(),
  uploadsJson: z.array(fileSchema).optional().nullable(),
});

router.get("/sales/accounts", requireSalesUser(), async (_req, res) => {
  const user = getSalesUser(res);
  const rows =
    user.role === "super_admin"
      ? await db.select().from(salesAccountsTable).orderBy(salesAccountsTable.companyName)
      : await db
          .select()
          .from(salesAccountsTable)
          .where(eq(salesAccountsTable.ownerRepId, user.repId ?? -1))
          .orderBy(salesAccountsTable.companyName);
  res.json(rows);
});

router.post("/sales/accounts", requireSuperAdmin(), async (req: Request, res: Response) => {
  const parsed = accountBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid account data" });
    return;
  }
  const d = parsed.data;
  const [account] = await db
    .insert(salesAccountsTable)
    .values({
      companyName: d.companyName,
      normalizedName: normalizeCompanyName(d.companyName),
      parentCompany: d.parentCompany ?? null,
      contactName: d.contactName ?? null,
      contactEmail: d.contactEmail ?? null,
      contactPhone: d.contactPhone ?? null,
      website: d.website ?? null,
      industry: d.industry ?? null,
      ownerRepId: d.ownerRepId ?? null,
      status: d.status,
      notes: d.notes ?? null,
      uploadsJson: d.uploadsJson ?? null,
    })
    .returning();
  res.status(201).json(account);
});

router.patch("/sales/accounts/:id", requireSuperAdmin(), async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const parsed = accountBodySchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid account data" });
    return;
  }
  const d = parsed.data;
  const [account] = await db
    .update(salesAccountsTable)
    .set({
      ...(d.companyName !== undefined
        ? { companyName: d.companyName, normalizedName: normalizeCompanyName(d.companyName) }
        : {}),
      ...(d.parentCompany !== undefined ? { parentCompany: d.parentCompany } : {}),
      ...(d.contactName !== undefined ? { contactName: d.contactName } : {}),
      ...(d.contactEmail !== undefined ? { contactEmail: d.contactEmail } : {}),
      ...(d.contactPhone !== undefined ? { contactPhone: d.contactPhone } : {}),
      ...(d.website !== undefined ? { website: d.website } : {}),
      ...(d.industry !== undefined ? { industry: d.industry } : {}),
      ...(d.ownerRepId !== undefined ? { ownerRepId: d.ownerRepId } : {}),
      ...(d.status !== undefined ? { status: d.status } : {}),
      ...(d.notes !== undefined ? { notes: d.notes } : {}),
      ...(d.uploadsJson !== undefined ? { uploadsJson: d.uploadsJson } : {}),
    })
    .where(eq(salesAccountsTable.id, id))
    .returning();
  if (!account) {
    res.status(404).json({ error: "Account not found" });
    return;
  }
  res.json(account);
});

// ───────────────────────────────────────────────────────────────────────
// Intake submissions list — scoped (reps see only their assigned intakes)
// ───────────────────────────────────────────────────────────────────────

router.get("/sales/submissions", requireSalesUser(), async (_req, res) => {
  const user = getSalesUser(res);
  const rows =
    user.role === "super_admin"
      ? await db
          .select()
          .from(salesIntakeSubmissionsTable)
          .orderBy(desc(salesIntakeSubmissionsTable.createdAt))
      : await db
          .select()
          .from(salesIntakeSubmissionsTable)
          .where(eq(salesIntakeSubmissionsTable.assignedRepId, user.repId ?? -1))
          .orderBy(desc(salesIntakeSubmissionsTable.createdAt));
  res.json(rows);
});

// ───────────────────────────────────────────────────────────────────────
// PUBLIC intake submit — no auth (allowlisted /public/* in the boundary)
// ───────────────────────────────────────────────────────────────────────

const intakeSubmitSchema = z.object({
  formType: z.enum(INTAKE_FORM_TYPES),
  linkSource: z.enum(INTAKE_LINK_SOURCES).optional().nullable(),
  companyName: z.string().trim().min(1, "Company name is required").max(300),
  contactName: z.string().trim().max(200).optional().nullable(),
  contactEmail: z.string().trim().max(200).optional().nullable(),
  contactPhone: z.string().trim().max(60).optional().nullable(),
  payload: z.record(z.string(), z.unknown()).default({}),
});

/**
 * Route a submission to a rep using the agreed precedence:
 *   1. existing account match (by normalized company name) → that account's owner
 *   2. intake link source (alyssa / drew / retta) → matching active rep
 *   3. otherwise → Super Admin review queue (no assigned rep)
 */
async function routeSubmission(companyName: string, linkSource: string | null | undefined) {
  // 1. Account match.
  const accounts = await db
    .select({
      id: salesAccountsTable.id,
      normalizedName: salesAccountsTable.normalizedName,
      ownerRepId: salesAccountsTable.ownerRepId,
    })
    .from(salesAccountsTable);
  const match = findBestAccountMatch(companyName, accounts);
  if (match) {
    const owner = accounts.find((a) => a.id === match.id)?.ownerRepId ?? null;
    if (owner) {
      const [rep] = await db
        .select({ id: salesRepsTable.id })
        .from(salesRepsTable)
        .where(and(eq(salesRepsTable.id, owner), eq(salesRepsTable.status, "active")))
        .limit(1);
      if (rep) {
        return { matchedAccountId: match.id, assignedRepId: rep.id, routingMethod: "account_match" as const };
      }
    }
    // Account exists but has no active owner — still record the match, fall
    // through to link-source / queue for assignment.
    if (linkSource && linkSource !== "general") {
      const repId = await findRepByLinkSource(linkSource);
      if (repId) {
        return { matchedAccountId: match.id, assignedRepId: repId, routingMethod: "link_source" as const };
      }
    }
    return { matchedAccountId: match.id, assignedRepId: null, routingMethod: "super_admin_queue" as const };
  }

  // 2. Link source.
  if (linkSource && linkSource !== "general") {
    const repId = await findRepByLinkSource(linkSource);
    if (repId) {
      return { matchedAccountId: null, assignedRepId: repId, routingMethod: "link_source" as const };
    }
  }

  // 3. Super Admin queue.
  return { matchedAccountId: null, assignedRepId: null, routingMethod: "super_admin_queue" as const };
}

/** Map a link source token (a rep's first name) to an active rep id. */
async function findRepByLinkSource(source: string): Promise<number | null> {
  const [rep] = await db
    .select({ id: salesRepsTable.id })
    .from(salesRepsTable)
    .where(and(sql`lower(${salesRepsTable.firstName}) = ${source.toLowerCase()}`, eq(salesRepsTable.status, "active")))
    .limit(1);
  return rep?.id ?? null;
}

/**
 * Only persist file links we'd be willing to render as an admin-clickable
 * anchor: https URLs and same-origin storage paths. This blocks javascript:,
 * data:, and other unsafe schemes from a public, attacker-controlled payload
 * (stored-XSS / script-URL injection) before they ever reach the admin UI.
 */
function isSafeFileUrl(url: string): boolean {
  const u = url.trim();
  if (!u) return false;
  if (u.startsWith("/")) return true; // same-origin relative (object storage paths)
  return /^https:\/\//i.test(u);
}

/** Pull any uploaded files out of the payload into a flat list for the opp. */
function collectFiles(payload: Record<string, unknown>): { name: string; url: string }[] {
  const files: { name: string; url: string }[] = [];
  for (const value of Object.values(payload)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item && typeof item === "object" && "url" in item && "name" in item) {
          const f = item as { name: unknown; url: unknown };
          if (typeof f.url === "string" && typeof f.name === "string" && isSafeFileUrl(f.url)) {
            files.push({ name: f.name, url: f.url });
          }
        }
      }
    }
  }
  return files;
}

router.post("/public/intake/submit", async (req: Request, res: Response) => {
  const parsed = intakeSubmitSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid submission" });
    return;
  }
  const d = parsed.data;
  const routing = await routeSubmission(d.companyName, d.linkSource);

  const [submission] = await db
    .insert(salesIntakeSubmissionsTable)
    .values({
      formType: d.formType,
      linkSource: d.linkSource ?? null,
      companyName: d.companyName,
      contactName: d.contactName ?? null,
      contactEmail: d.contactEmail ?? null,
      contactPhone: d.contactPhone ?? null,
      payloadJson: d.payload,
      matchedAccountId: routing.matchedAccountId,
      assignedRepId: routing.assignedRepId,
      routingMethod: routing.routingMethod,
      status: "new",
    })
    .returning();

  const payload = d.payload as Record<string, unknown>;
  const projectType =
    (typeof payload.projectName === "string" && payload.projectName) ||
    (typeof payload.campaignName === "string" && payload.campaignName) ||
    (d.formType === "pole_banner" ? "Pole Banner Program" : "General Project");
  const quoteNeededBy = typeof payload.quoteNeededBy === "string" && payload.quoteNeededBy ? payload.quoteNeededBy : null;
  const eventDate = typeof payload.eventDate === "string" && payload.eventDate ? payload.eventDate : null;
  const installDate = typeof payload.installDate === "string" && payload.installDate ? payload.installDate : null;
  const removalDate = typeof payload.removalDate === "string" && payload.removalDate ? payload.removalDate : null;
  const files = collectFiles(payload);

  await db.insert(salesOpportunitiesTable).values({
    companyName: d.companyName,
    contactName: d.contactName ?? null,
    assignedRepId: routing.assignedRepId,
    matchedAccountId: routing.matchedAccountId,
    intakeSubmissionId: submission.id,
    projectType: String(projectType),
    stage: "new_intake",
    quoteNeededBy,
    eventDate,
    installDate,
    removalDate,
    filesJson: files.length > 0 ? files : null,
    source: d.linkSource ?? null,
    routingMethod: routing.routingMethod,
  });

  req.log?.info(
    { submissionId: submission.id, routingMethod: routing.routingMethod, assignedRepId: routing.assignedRepId },
    "sales intake submission routed",
  );

  // Notify the assigned rep (or the Super Admin queue when unassigned). Never
  // let an email failure break the public submission — fire and log.
  void (async () => {
    try {
      let assignedRep: SalesRep | null = null;
      if (routing.assignedRepId) {
        const [rep] = await db
          .select()
          .from(salesRepsTable)
          .where(eq(salesRepsTable.id, routing.assignedRepId))
          .limit(1);
        assignedRep = rep ?? null;
      }
      const result = await sendIntakeRoutedNotification({
        companyName: d.companyName,
        contactName: d.contactName ?? null,
        contactEmail: d.contactEmail ?? null,
        contactPhone: d.contactPhone ?? null,
        formType: d.formType,
        routingMethod: routing.routingMethod,
        assignedRep,
        opportunityId: submission.id,
      });
      if (!result.ok && !result.skipped) {
        req.log?.warn({ submissionId: submission.id, error: result.error }, "sales intake notification failed");
      }
    } catch (err) {
      req.log?.error({ err, submissionId: submission.id }, "sales intake notification threw");
    }
  })();

  res.status(201).json({ ok: true });
});

// ───────────────────────────────────────────────────────────────────────
// Opportunities — pipeline, stage moves, won/lost, notes, files
// ───────────────────────────────────────────────────────────────────────

/** Restrict a query to the caller's own rows unless they're a Super Admin. */
function scopedOppWhere(user: ReturnType<typeof getSalesUser>) {
  if (user.role === "super_admin") return undefined;
  return eq(salesOpportunitiesTable.assignedRepId, user.repId ?? -1);
}

router.get("/sales/opportunities", requireSalesUser(), async (_req, res) => {
  const user = getSalesUser(res);
  const where = scopedOppWhere(user);
  const rows = where
    ? await db.select().from(salesOpportunitiesTable).where(where).orderBy(desc(salesOpportunitiesTable.createdAt))
    : await db.select().from(salesOpportunitiesTable).orderBy(desc(salesOpportunitiesTable.createdAt));

  // Decorate with the assigned rep's display name for the board/list.
  const reps = await db
    .select({ id: salesRepsTable.id, firstName: salesRepsTable.firstName, lastName: salesRepsTable.lastName })
    .from(salesRepsTable);
  const repName = new Map(reps.map((r) => [r.id, `${r.firstName} ${r.lastName}`.trim()]));
  res.json(rows.map((o) => ({ ...o, assignedRepName: o.assignedRepId ? repName.get(o.assignedRepId) ?? null : null })));
});

router.get("/sales/opportunities/:id", requireSalesUser(), async (req: Request, res: Response) => {
  const user = getSalesUser(res);
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [opp] = await db.select().from(salesOpportunitiesTable).where(eq(salesOpportunitiesTable.id, id)).limit(1);
  if (!opp) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  if (user.role !== "super_admin" && opp.assignedRepId !== user.repId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const notes = await db
    .select()
    .from(salesOpportunityNotesTable)
    .where(eq(salesOpportunityNotesTable.opportunityId, id))
    .orderBy(desc(salesOpportunityNotesTable.createdAt));
  const assignedRepName = opp.assignedRepId
    ? (
        await db
          .select({ firstName: salesRepsTable.firstName, lastName: salesRepsTable.lastName })
          .from(salesRepsTable)
          .where(eq(salesRepsTable.id, opp.assignedRepId))
          .limit(1)
      ).map((r) => `${r.firstName} ${r.lastName}`.trim())[0] ?? null
    : null;
  res.json({ ...opp, assignedRepName, notes });
});

const moneyField = z
  .union([z.string(), z.number()])
  .transform((v) => (v === "" || v === null || v === undefined ? null : String(v)))
  .nullable()
  .optional();

const opportunityPatchSchema = z.object({
  stage: z.enum(OPPORTUNITY_STAGES).optional(),
  projectType: z.string().trim().max(300).nullable().optional(),
  estimatedValue: moneyField,
  quoteNeededBy: z.string().trim().max(40).nullable().optional(),
  eventDate: z.string().trim().max(40).nullable().optional(),
  installDate: z.string().trim().max(40).nullable().optional(),
  removalDate: z.string().trim().max(40).nullable().optional(),
  notes: z.string().trim().nullable().optional(),
  // Super Admin can reassign.
  assignedRepId: z.number().int().nullable().optional(),
  // Lost tracking.
  lostReason: z.enum(OPPORTUNITY_LOST_REASONS).nullable().optional(),
  competitorName: z.string().trim().max(300).nullable().optional(),
  competitorPrice: moneyField,
  a3Price: moneyField,
  lostNotes: z.string().trim().nullable().optional(),
});

router.patch("/sales/opportunities/:id", requireSalesUser(), async (req: Request, res: Response) => {
  const user = getSalesUser(res);
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const parsed = opportunityPatchSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid update" });
    return;
  }
  const [opp] = await db.select().from(salesOpportunitiesTable).where(eq(salesOpportunitiesTable.id, id)).limit(1);
  if (!opp) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  if (user.role !== "super_admin" && opp.assignedRepId !== user.repId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const d = parsed.data;
  const update: Record<string, unknown> = {};
  for (const key of [
    "stage",
    "projectType",
    "estimatedValue",
    "quoteNeededBy",
    "eventDate",
    "installDate",
    "removalDate",
    "notes",
    "lostReason",
    "competitorName",
    "competitorPrice",
    "a3Price",
    "lostNotes",
  ] as const) {
    if (d[key] !== undefined) update[key] = d[key];
  }
  // Only Super Admin may reassign an opportunity to another rep.
  if (d.assignedRepId !== undefined) {
    if (user.role !== "super_admin") {
      res.status(403).json({ error: "Only a Super Admin can reassign opportunities" });
      return;
    }
    update.assignedRepId = d.assignedRepId;
  }
  // Clear lost fields when moving out of the lost stage to avoid stale data.
  if (d.stage && d.stage !== "lost") {
    update.lostReason = null;
    update.competitorName = null;
    update.competitorPrice = null;
    update.a3Price = null;
    update.lostNotes = null;
  }
  if (Object.keys(update).length === 0) {
    res.json(opp);
    return;
  }
  const [updated] = await db
    .update(salesOpportunitiesTable)
    .set(update)
    .where(eq(salesOpportunitiesTable.id, id))
    .returning();
  res.json(updated);
});

const noteSchema = z.object({ body: z.string().trim().min(1, "Note cannot be empty").max(5000) });

router.post("/sales/opportunities/:id/notes", requireSalesUser(), async (req: Request, res: Response) => {
  const user = getSalesUser(res);
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const parsed = noteSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid note" });
    return;
  }
  const [opp] = await db.select().from(salesOpportunitiesTable).where(eq(salesOpportunitiesTable.id, id)).limit(1);
  if (!opp) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  if (user.role !== "super_admin" && opp.assignedRepId !== user.repId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const authorName =
    [user.firstName, user.lastName].filter(Boolean).join(" ").trim() || user.email || null;
  const [note] = await db
    .insert(salesOpportunityNotesTable)
    .values({
      opportunityId: id,
      authorRepId: user.repId ?? null,
      authorName,
      body: parsed.data.body,
    })
    .returning();
  res.status(201).json(note);
});

const oppFileSchema = z.object({
  name: z.string().trim().min(1).max(400),
  url: z.string().trim().min(1).max(2000).refine(isSafeFileUrl, "Unsafe file URL"),
});
const filesPatchSchema = z.object({ files: z.array(oppFileSchema).max(50) });

router.patch("/sales/opportunities/:id/files", requireSalesUser(), async (req: Request, res: Response) => {
  const user = getSalesUser(res);
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const parsed = filesPatchSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid files" });
    return;
  }
  const [opp] = await db.select().from(salesOpportunitiesTable).where(eq(salesOpportunitiesTable.id, id)).limit(1);
  if (!opp) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  if (user.role !== "super_admin" && opp.assignedRepId !== user.repId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const [updated] = await db
    .update(salesOpportunitiesTable)
    .set({ filesJson: parsed.data.files.length > 0 ? parsed.data.files : null })
    .where(eq(salesOpportunitiesTable.id, id))
    .returning();
  res.json(updated);
});

export default router;
