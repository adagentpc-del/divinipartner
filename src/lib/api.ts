/**
 * Backend API client. All data/auth/storage flows through the Express backend
 * (same origin). Native session auth: the session is delivered as an httpOnly
 * cookie (sent automatically with credentials:'include') AND, as a fallback for
 * cross-origin / mobile contexts, as a Bearer token persisted in localStorage.
 *
 * Zero em dashes.
 */
const BASE = (import.meta.env.BASE_URL || '/').replace(/\/$/, '');

const TOKEN_KEY = 'divini_session_token';

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage may be unavailable */
  }
}

function authHeader(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let detail = '';
    try {
      const body = await res.json();
      detail = body?.error || JSON.stringify(body);
    } catch {
      detail = res.statusText;
    }
    throw new Error(detail || `Request failed (${res.status})`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}/api${path}`, {
    credentials: 'include',
    headers: { ...authHeader() },
  });
  return handle<T>(res);
}

export async function apiSend<T>(
  method: 'POST' | 'PATCH' | 'DELETE' | 'PUT',
  path: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch(`${BASE}/api${path}`, {
    method,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...authHeader(),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return handle<T>(res);
}

/** Fetch a binary response (e.g. a PDF) with the auth header, as a Blob. */
export async function apiBlob(path: string): Promise<Blob> {
  const res = await fetch(`${BASE}/api${path}`, {
    credentials: 'include',
    headers: { ...authHeader() },
  });
  if (!res.ok) {
    let detail = res.statusText;
    try { const b = await res.json(); detail = b?.error || detail; } catch { /* ignore */ }
    throw new Error(detail || `Request failed (${res.status})`);
  }
  return res.blob();
}

export async function apiUpload<T>(path: string, form: FormData): Promise<T> {
  const res = await fetch(`${BASE}/api${path}`, {
    method: 'POST',
    credentials: 'include',
    headers: { ...authHeader() }, // do NOT set Content-Type; browser sets boundary
    body: form,
  });
  return handle<T>(res);
}
