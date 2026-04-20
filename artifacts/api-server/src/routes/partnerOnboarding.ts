import { Router, type IRouter } from "express";
import { db, partnerOnboardingSubmissionsTable, partnersTable } from "@workspace/db";
import { eq, desc, sql } from "drizzle-orm";
import { z } from "zod";

const optStr = (max: number) => z.string().max(max).optional().nullable();
const SubmissionBody = z.object({
  companyName: z.string().min(1, "Company name is required").max(200),
  websiteUrl: optStr(500),
  industryFocus: optStr(200),
  partnerType: z.enum(["branding", "ordering"]).optional().nullable(),
  portalMode: z.enum(["intake", "full", "ordering"]).optional().nullable(),
  hasTours: z.enum(["yes", "no"]).optional().nullable(),
  introHeadline: optStr(300),
  introText: optStr(2000),
  thankYouText: optStr(2000),
  brandColors: optStr(500),
  logoUrl: optStr(2000),
  secondaryLogoUrl: optStr(2000),
  brandAssetsJson: z.array(z.object({ name: z.string().max(255), url: z.string().max(2000) })).max(20).optional().nullable(),
  contactName: z.string().min(1, "Contact name is required").max(200),
  contactEmail: z.string().email("Valid email required").max(320),
  contactPhone: optStr(50),
  contactRole: optStr(200),
  billingContactName: optStr(200),
  billingEmail: z.string().email().max(320).optional().nullable().or(z.literal("")),
  billingPhone: optStr(50),
  billingAddress: optStr(1000),
  taxId: optStr(100),
  paymentTerms: optStr(300),
  billingNotes: optStr(2000),
  whatWeNeed: optStr(3000),
  timeline: optStr(300),
  budgetRange: optStr(200),
  referenceUrls: optStr(1000),
});

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || `partner-${Date.now()}`;
}

const router: IRouter = Router();

// PUBLIC submit
router.post("/onboarding/submit", async (req, res): Promise<void> => {
  const parsed = SubmissionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues });
    return;
  }
  const data = { ...parsed.data, billingEmail: parsed.data.billingEmail || null };
  const [created] = await db.insert(partnerOnboardingSubmissionsTable).values(data as any).returning();
  res.status(201).json({ id: created.id, status: "received" });
});

// ADMIN list
router.get("/onboarding/submissions", async (_req, res): Promise<void> => {
  const rows = await db.select().from(partnerOnboardingSubmissionsTable).orderBy(desc(partnerOnboardingSubmissionsTable.createdAt));
  res.json(rows);
});

// ADMIN single
router.get("/onboarding/submissions/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [row] = await db.select().from(partnerOnboardingSubmissionsTable).where(eq(partnerOnboardingSubmissionsTable.id, id));
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(row);
});

// ADMIN status / notes
router.patch("/onboarding/submissions/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const Body = z.object({
    status: z.enum(["new", "reviewing", "approved", "rejected", "converted"]).optional(),
    internalNotes: z.string().optional().nullable(),
  });
  const parsed = Body.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues }); return; }
  const updates: any = { ...parsed.data };
  if (parsed.data.status && parsed.data.status !== "new") updates.reviewedAt = new Date();
  const [updated] = await db.update(partnerOnboardingSubmissionsTable).set(updates).where(eq(partnerOnboardingSubmissionsTable.id, id)).returning();
  if (!updated) { res.status(404).json({ error: "Not found" }); return; }
  res.json(updated);
});

// ADMIN convert -> creates partner from submission (transactional)
router.post("/onboarding/submissions/:id/convert", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  try {
    const result = await db.transaction(async (tx) => {
      const lockRows = await tx.execute(
        sql`SELECT * FROM partner_onboarding_submissions WHERE id = ${id} FOR UPDATE`
      );
      const sub = (lockRows as any).rows?.[0];
      if (!sub) return { error: "not_found" as const };
      if (sub.converted_partner_id) return { error: "already_converted" as const, partnerId: sub.converted_partner_id };

      const slugBase = slugify(sub.company_name);
      let slug = slugBase;
      for (let suffix = 2; suffix < 200; suffix++) {
        const [exists] = await tx.select({ id: partnersTable.id }).from(partnersTable).where(eq(partnersTable.slug, slug));
        if (!exists) break;
        slug = `${slugBase}-${suffix}`;
      }

      const partnerType = (sub.partner_type === "branding" || sub.partner_type === "ordering") ? sub.partner_type : "branding";
      const portalMode = (sub.portal_mode === "intake" || sub.portal_mode === "full" || sub.portal_mode === "ordering") ? sub.portal_mode : "intake";

      const [partner] = await tx.insert(partnersTable).values({
        companyName: sub.company_name,
        slug,
        logoUrl: sub.logo_url,
        secondaryLogoUrl: sub.secondary_logo_url,
        websiteUrl: sub.website_url,
        introHeadline: sub.intro_headline,
        introText: sub.intro_text,
        thankYouText: sub.thank_you_text,
        contactName: sub.contact_name,
        contactEmail: sub.contact_email,
        contactPhone: sub.contact_phone,
        routingEmail: sub.contact_email,
        industryFocus: sub.industry_focus,
        portalMode,
        partnerType,
        billingInfoJson: {
          contactName: sub.billing_contact_name || undefined,
          email: sub.billing_email || undefined,
          phone: sub.billing_phone || undefined,
          address: sub.billing_address || undefined,
          taxId: sub.tax_id || undefined,
          paymentTerms: sub.payment_terms || undefined,
        },
        isActive: false,
      }).returning();

      await tx.update(partnerOnboardingSubmissionsTable)
        .set({ status: "converted", convertedPartnerId: partner.id, reviewedAt: new Date() })
        .where(eq(partnerOnboardingSubmissionsTable.id, id));

      return { partnerId: partner.id, slug: partner.slug };
    });

    if ("error" in result && result.error === "not_found") { res.status(404).json({ error: "Not found" }); return; }
    if ("error" in result && result.error === "already_converted") { res.status(409).json({ error: "Already converted", partnerId: result.partnerId }); return; }
    res.status(201).json(result);
  } catch (e: any) {
    if (e?.code === "23505") { res.status(409).json({ error: "Slug conflict — please retry" }); return; }
    throw e;
  }
});

export default router;
