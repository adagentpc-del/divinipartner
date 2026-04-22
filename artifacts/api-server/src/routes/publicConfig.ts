import { Router } from "express";
import { getPublicUrlInfo } from "../lib/publicUrl";

const router: Router = Router();

router.get("/public-config", (_req, res) => {
  const info = getPublicUrlInfo();
  res.json({
    publicAppUrl: info.url,
    publicHost: info.host,
    source: info.source,
    isCustomDomain: info.isCustomDomain,
    fallbackHosts: info.fallbackHosts,
    publicAppUrlConfigured: info.source === "PUBLIC_APP_URL",
  });
});

export default router;
