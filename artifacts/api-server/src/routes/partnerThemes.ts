import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, partnerThemesTable } from "@workspace/db";
import { z } from "zod";

const router: IRouter = Router();

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
});

router.get("/partners/:id/theme", async (req, res): Promise<void> => {
  const partnerId = parseInt(req.params.id);
  if (isNaN(partnerId)) { res.status(400).json({ error: "Invalid partner id" }); return; }

  const [theme] = await db.select().from(partnerThemesTable).where(eq(partnerThemesTable.partnerId, partnerId));
  if (!theme) { res.json(null); return; }
  res.json(theme);
});

router.put("/partners/:id/theme", async (req, res): Promise<void> => {
  const partnerId = parseInt(req.params.id);
  if (isNaN(partnerId)) { res.status(400).json({ error: "Invalid partner id" }); return; }

  const parsed = ThemeBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const existing = await db.select().from(partnerThemesTable).where(eq(partnerThemesTable.partnerId, partnerId));

  if (existing.length > 0) {
    const [theme] = await db.update(partnerThemesTable).set(parsed.data).where(eq(partnerThemesTable.partnerId, partnerId)).returning();
    res.json(theme);
  } else {
    const [theme] = await db.insert(partnerThemesTable).values({ ...parsed.data, partnerId }).returning();
    res.status(201).json(theme);
  }
});

export default router;
