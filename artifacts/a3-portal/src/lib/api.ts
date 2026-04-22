const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

export function apiUrl(path: string): string {
  return `${basePath}${path}`;
}

export function resolveAssetUrl(url: string | null | undefined): string {
  if (!url) return "";
  if (/^(https?:|data:|blob:)/i.test(url)) return url;
  if (url.startsWith("/objects/") || url.startsWith("/public-objects/")) {
    return apiUrl(`/api/storage${url}`);
  }
  return url;
}

export async function apiFetch<T = any>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(apiUrl(path), {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  if (!res.ok) {
    let message = res.statusText;
    let body: any = null;
    try {
      body = await res.json();
      message = body?.error || message;
    } catch { /* noop */ }
    const err = new Error(message) as Error & { status?: number; body?: any };
    err.status = res.status;
    err.body = body;
    throw err;
  }
  return res.json();
}
