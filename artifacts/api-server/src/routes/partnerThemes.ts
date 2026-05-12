import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { eq } from "drizzle-orm";
import { db, partnerThemesTable } from "@workspace/db";
import { z } from "zod";
import { getAuth } from "@clerk/express";
import {
  GetPartnerThemeResponse,
  UpsertPartnerThemeResponse,
} from "@workspace/api-zod";
import { sendValidated } from "../lib/validateResponse";

const router: IRouter = Router();

function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  next();
}

const ThemeBody = z.object({
  primaryColor: z.string().optional(),
  secondaryColor: z.string().optional(),
  accentColor: z.string().optional(),
  backgroundColor: z.string().optional(),
  buttonColor: z.string().optional(),
  textColor: z.string().optional(),
  headingFont: z.string().optional(),
  bodyFont: z.string().optional(),
  buttonStyle: z.string().optional(),
  borderRadius: z.string().optional(),
  tonePreset: z.string().optional(),
  themeNotes: z.string().optional(),
  aiSuggestedJson: z.string().optional(),
  isApproved: z.string().optional(),
  templateKey: z.string().optional(),
  logoStorageKey: z.string().nullable().optional(),
  logoUrl: z.string().nullable().optional(),
  logoAltText: z.string().nullable().optional(),
  logoPlacement: z.string().optional(),
  logoBackgroundTreatment: z.string().optional(),
  heroEyebrow: z.string().nullable().optional(),
  heroHeadline: z.string().nullable().optional(),
  heroSubheadline: z.string().nullable().optional(),
  heroBackgroundMode: z.string().optional(),
  heroBackgroundStorageKey: z.string().nullable().optional(),
  heroOverlayIntensity: z.number().optional(),
  cardStyle: z.string().optional(),
  borderRadiusStyle: z.string().optional(),
  ctaLabel: z.string().nullable().optional(),
  secondaryCtaLabel: z.string().nullable().optional(),
  showPoweredByA3: z.boolean().optional(),
  customWelcomeMessage: z.string().nullable().optional(),
  isPublished: z.boolean().optional(),
});

router.get("/partners/:id/theme", requireAuth, async (req, res): Promise<void> => {
  const partnerId = parseInt(String(req.params.id));
  if (isNaN(partnerId)) { res.status(400).json({ error: "Invalid partner id" }); return; }

  const [theme] = await db.select().from(partnerThemesTable).where(eq(partnerThemesTable.partnerId, partnerId));
  sendValidated(req, res, GetPartnerThemeResponse, theme ?? null, "Get partner theme");
});

router.put("/partners/:id/theme", requireAuth, async (req, res): Promise<void> => {
  const partnerId = parseInt(String(req.params.id));
  if (isNaN(partnerId)) { res.status(400).json({ error: "Invalid partner id" }); return; }

  const parsed = ThemeBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const existing = await db.select().from(partnerThemesTable).where(eq(partnerThemesTable.partnerId, partnerId));

  if (existing.length > 0) {
    const [theme] = await db.update(partnerThemesTable).set(parsed.data).where(eq(partnerThemesTable.partnerId, partnerId)).returning();
    sendValidated(req, res, UpsertPartnerThemeResponse, theme, "Upsert partner theme");
  } else {
    const [theme] = await db.insert(partnerThemesTable).values({ ...parsed.data, partnerId }).returning();
    sendValidated(req, res, UpsertPartnerThemeResponse, theme, "Upsert partner theme", 201);
  }
});

export default router;
