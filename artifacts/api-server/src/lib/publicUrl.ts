import { logger } from "./logger";

export interface PublicUrlInfo {
  url: string;
  host: string;
  source: "PUBLIC_APP_URL" | "REPLIT_DOMAINS" | "fallback";
  isCustomDomain: boolean;
  fallbackHosts: string[];
}

function normalize(raw: string): string | null {
  let v = raw.trim();
  if (!v) return null;
  if (!/^https?:\/\//i.test(v)) v = `https://${v}`;
  try {
    const u = new URL(v);
    return `${u.protocol}//${u.host}`;
  } catch {
    return null;
  }
}

function replitHosts(): string[] {
  const raw = process.env.REPLIT_DOMAINS || "";
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function getPublicUrlInfo(): PublicUrlInfo {
  const fallbackHosts = replitHosts();
  const fromEnv = process.env.PUBLIC_APP_URL ? normalize(process.env.PUBLIC_APP_URL) : null;
  if (fromEnv) {
    const host = new URL(fromEnv).host;
    const isCustom = !host.endsWith(".replit.app") && !host.endsWith(".replit.dev");
    return {
      url: fromEnv,
      host,
      source: "PUBLIC_APP_URL",
      isCustomDomain: isCustom,
      fallbackHosts,
    };
  }
  if (fallbackHosts.length > 0) {
    const url = `https://${fallbackHosts[0]}`;
    return {
      url,
      host: fallbackHosts[0],
      source: "REPLIT_DOMAINS",
      isCustomDomain: false,
      fallbackHosts,
    };
  }
  return {
    url: "http://localhost",
    host: "localhost",
    source: "fallback",
    isCustomDomain: false,
    fallbackHosts: [],
  };
}

export function publicAppUrl(): string {
  return getPublicUrlInfo().url;
}

export function publicLink(path: string): string {
  const base = publicAppUrl().replace(/\/$/, "");
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${base}${p}`;
}

let warned = false;
export function warnIfFallback() {
  const info = getPublicUrlInfo();
  if (info.source !== "PUBLIC_APP_URL" && !warned) {
    warned = true;
    logger.warn(
      { source: info.source, host: info.host },
      "PUBLIC_APP_URL not set; using fallback host for customer-facing links",
    );
  }
}
