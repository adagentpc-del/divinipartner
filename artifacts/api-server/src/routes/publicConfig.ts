import { Router } from "express";
import { GetPublicConfigResponse } from "@workspace/api-zod";
import { getPublicUrlInfo } from "../lib/publicUrl";
import { sendValidated } from "../lib/validateResponse";

const router: Router = Router();

router.get("/public-config", (req, res) => {
  const info = getPublicUrlInfo();
  const payload = {
    publicAppUrl: info.url,
    publicHost: info.host,
    source: info.source,
    isCustomDomain: info.isCustomDomain,
    fallbackHosts: info.fallbackHosts,
    publicAppUrlConfigured: info.source === "PUBLIC_APP_URL",
  };
  sendValidated(req, res, GetPublicConfigResponse, payload, "Get public config");
});

export default router;
