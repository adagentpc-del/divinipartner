const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

export interface PublicConfig {
  publicAppUrl: string;
  publicHost: string;
  source: "PUBLIC_APP_URL" | "REPLIT_DOMAINS" | "fallback";
  isCustomDomain: boolean;
  fallbackHosts: string[];
  publicAppUrlConfigured: boolean;
}

let cached: PublicConfig | null = null;
let inflight: Promise<PublicConfig> | null = null;

export async function fetchPublicConfig(): Promise<PublicConfig> {
  if (cached) return cached;
  if (inflight) return inflight;
  inflight = fetch(`${basePath}/api/public-config`)
    .then((r) => r.json())
    .then((j: PublicConfig) => {
      cached = j;
      inflight = null;
      return j;
    })
    .catch((e) => {
      inflight = null;
      throw e;
    });
  return inflight;
}

export function publicLinkFrom(cfg: PublicConfig | null, path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  if (cfg && cfg.publicAppUrlConfigured) {
    return `${cfg.publicAppUrl.replace(/\/$/, "")}${basePath}${p}`;
  }
  return `${window.location.origin}${basePath}${p}`;
}
