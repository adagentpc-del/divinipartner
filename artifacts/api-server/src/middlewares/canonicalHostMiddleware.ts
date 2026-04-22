import type { Request, Response, NextFunction } from "express";
import { getPublicUrlInfo } from "../lib/publicUrl";

const REPLIT_DEV_SUFFIXES = [".replit.dev", ".picard.replit.dev", ".kirk.replit.dev"];

function isReplitDevHost(host: string): boolean {
  return REPLIT_DEV_SUFFIXES.some((s) => host.endsWith(s));
}

export function canonicalHostMiddleware() {
  return function canonicalHost(req: Request, res: Response, next: NextFunction) {
    if (req.method !== "GET" && req.method !== "HEAD") return next();

    const info = getPublicUrlInfo();
    if (info.source !== "PUBLIC_APP_URL" || !info.isCustomDomain) return next();

    if (process.env.NODE_ENV !== "production" && process.env.CANONICAL_REDIRECT !== "1") {
      return next();
    }

    const hostHeader = (req.headers["x-forwarded-host"] as string) || req.headers.host || "";
    const host = hostHeader.split(",")[0].trim().toLowerCase();
    if (!host) return next();

    const canonicalHost = info.host.toLowerCase();
    if (host === canonicalHost) return next();

    const isReplitProd = host.endsWith(".replit.app");
    const isReplitDev = isReplitDevHost(host);
    if (!isReplitProd && !isReplitDev) return next();

    if (isReplitDev) return next();

    if (req.path.startsWith("/api") || req.path.startsWith("/__clerk")) return next();

    const accept = String(req.headers["accept"] || "");
    const wantsHtml = accept.includes("text/html") || accept === "" || accept.includes("*/*");
    if (!wantsHtml) return next();

    const target = `${info.url}${req.originalUrl}`;
    res.setHeader("Cache-Control", "no-store");
    return res.redirect(308, target);
  };
}
