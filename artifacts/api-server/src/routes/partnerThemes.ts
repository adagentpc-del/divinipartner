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

// Allow http(s) absolute URLs and same-site relative paths only. Empty / null
// is permitted (means "unset"). Blocks javascript:, data:, vbscript:, file:,
// etc. — these would XSS / open-redirect when rendered into <video src> or
// <a href> on the public partner portal.
const SafeUrl = z.string()
  .nullable()
  .optional()
  .refine((v) => {
    if (v == null || v === "") return true;
    if (v.startsWith("/") && !v.startsWith("//")) return true; // relative path
    try {
      const u = new URL(v);
      return u.protocol === "http:" || u.protocol === "https:";
    } catch {
      return false;
    }
  }, { message: "URL must be http(s) or a same-site relative path" });

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
  ctaUrl: SafeUrl,
  secondaryCtaLabel: z.string().nullable().optional(),
  secondaryCtaUrl: SafeUrl,
  headerTheme: z.enum(["dark", "light"]).optional(),
  headerLayoutStyle: z.enum(["full_width_hero", "centered_logo_hero", "event_microsite", "minimal", "split_image"]).optional(),
  headerBackgroundVideoUrl: SafeUrl,
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
