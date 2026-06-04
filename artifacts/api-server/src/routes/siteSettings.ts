import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, siteSettingsTable } from "@workspace/db";
import {
  GetSiteSettingsResponse,
  UpdateSiteSettingsBody,
  GetPublicSiteSettingsResponse,
} from "@workspace/api-zod";
import { sendValidated } from "../lib/validateResponse";

const router: IRouter = Router();

const DEMO_VIDEO_KEY = "demo_video";

type DemoVideoSettings = {
  mainDemoVideoUrl: string | null;
  mainDemoVideoPosterUrl: string | null;
  mainDemoVideoTitle: string | null;
  mainDemoVideoDescription: string | null;
  mainDemoVideoEnabled: boolean;
};

const DEFAULT_DEMO_VIDEO: DemoVideoSettings = {
  mainDemoVideoUrl: null,
  mainDemoVideoPosterUrl: null,
  mainDemoVideoTitle: null,
  mainDemoVideoDescription: null,
  mainDemoVideoEnabled: true,
};

async function readDemoVideoSettings(): Promise<DemoVideoSettings> {
  const [row] = await db
    .select()
    .from(siteSettingsTable)
    .where(eq(siteSettingsTable.key, DEMO_VIDEO_KEY));
  const stored = (row?.value ?? {}) as Partial<DemoVideoSettings>;
  return {
    mainDemoVideoUrl: stored.mainDemoVideoUrl ?? DEFAULT_DEMO_VIDEO.mainDemoVideoUrl,
    mainDemoVideoPosterUrl: stored.mainDemoVideoPosterUrl ?? DEFAULT_DEMO_VIDEO.mainDemoVideoPosterUrl,
    mainDemoVideoTitle: stored.mainDemoVideoTitle ?? DEFAULT_DEMO_VIDEO.mainDemoVideoTitle,
    mainDemoVideoDescription: stored.mainDemoVideoDescription ?? DEFAULT_DEMO_VIDEO.mainDemoVideoDescription,
    mainDemoVideoEnabled: stored.mainDemoVideoEnabled ?? DEFAULT_DEMO_VIDEO.mainDemoVideoEnabled,
  };
}

// Public read — used by the front-page demo video section. No auth.
router.get("/public/site-settings", async (req, res): Promise<void> => {
  const settings = await readDemoVideoSettings();
  sendValidated(req, res, GetPublicSiteSettingsResponse, settings, "Get public site settings");
});

// Admin read.
router.get("/site-settings", async (req, res): Promise<void> => {
  const settings = await readDemoVideoSettings();
  sendValidated(req, res, GetSiteSettingsResponse, settings, "Get site settings");
});

// Admin upsert. Merges incoming fields over the stored config so a partial
// update doesn't clobber unspecified fields.
router.put("/site-settings", async (req, res): Promise<void> => {
  const parsed = UpdateSiteSettingsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const current = await readDemoVideoSettings();
  const normalize = (v: unknown): string | null =>
    typeof v === "string" && v.trim() === "" ? null : (v as string | null);

  const next: DemoVideoSettings = {
    mainDemoVideoUrl: parsed.data.mainDemoVideoUrl !== undefined ? normalize(parsed.data.mainDemoVideoUrl) : current.mainDemoVideoUrl,
    mainDemoVideoPosterUrl: parsed.data.mainDemoVideoPosterUrl !== undefined ? normalize(parsed.data.mainDemoVideoPosterUrl) : current.mainDemoVideoPosterUrl,
    mainDemoVideoTitle: parsed.data.mainDemoVideoTitle !== undefined ? normalize(parsed.data.mainDemoVideoTitle) : current.mainDemoVideoTitle,
    mainDemoVideoDescription: parsed.data.mainDemoVideoDescription !== undefined ? normalize(parsed.data.mainDemoVideoDescription) : current.mainDemoVideoDescription,
    mainDemoVideoEnabled: parsed.data.mainDemoVideoEnabled !== undefined ? parsed.data.mainDemoVideoEnabled : current.mainDemoVideoEnabled,
  };

  await db
    .insert(siteSettingsTable)
    .values({ key: DEMO_VIDEO_KEY, value: next })
    .onConflictDoUpdate({ target: siteSettingsTable.key, set: { value: next } });

  sendValidated(req, res, GetSiteSettingsResponse, next, "Update site settings");
});

export default router;
