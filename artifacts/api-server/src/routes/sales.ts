import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod/v4";
import { and, desc, eq, sql } from "drizzle-orm";
import {
  db,
  salesRepsTable,
  salesAccountsTable,
  salesIntakeSubmissionsTable,
  salesOpportunitiesTable,
  SALES_REP_ROLES,
  SALES_REP_STATUSES,
  SALES_ACCOUNT_STATUSES,
  INTAKE_FORM_TYPES,
  INTAKE_LINK_SOURCES,
} from "@workspace/db";
import {
  requireSalesUser,
  requireSuperAdmin,
  getSalesUser,
} from "../middlewares/requireSalesUser.js";
import { normalizeCompanyName, findBestAccountMatch } from "../lib/salesMatching.js";

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

/** Pull any uploaded files out of the payload into a flat list for the opp. */
function collectFiles(payload: Record<string, unknown>): { name: string; url: string }[] {
  const files: { name: string; url: string }[] = [];
  for (const value of Object.values(payload)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item && typeof item === "object" && "url" in item && "name" in item) {
          const f = item as { name: unknown; url: unknown };
          if (typeof f.url === "string" && typeof f.name === "string") files.push({ name: f.name, url: f.url });
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

  res.status(201).json({ ok: true });
});

export default router;
