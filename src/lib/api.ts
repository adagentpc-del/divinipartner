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
const CSRF_COOKIE = 'divini_csrf';
const CSRF_HEADER = 'X-CSRF-Token';

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

/**
 * Read the (non-httpOnly) divini_csrf cookie the server issues alongside the
 * session cookie (server/src/lib/csrf.ts) and echo it back as a header on
 * every mutating request -- the double-submit half of CSRF protection. A
 * cross-site page can trick the browser into attaching the session cookie,
 * but cannot read this cookie's value to also set the header.
 */
function csrfHeader(): Record<string, string> {
  const re = new RegExp(`(?:^|;\\s*)${CSRF_COOKIE}=([^;]+)`);
  const match = document.cookie.match(re);
  if (!match) return {};
  try {
    return { [CSRF_HEADER]: decodeURIComponent(match[1]) };
  } catch {
    return { [CSRF_HEADER]: match[1] };
  }
}

/**
 * Thrown on any non-2xx response. Keeps `.message` a plain string (every
 * existing `catch (e) { setErr((e as Error).message) }` call site keeps
 * working unchanged) while also carrying the parsed JSON body, so callers
 * that need structured error data -- e.g. a `plan_limit_reached` response,
 * see lib/entitlements.tsx -- do not have to re-derive it from a string.
 */
export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, body: unknown, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let body: unknown = null;
    let detail = '';
    try {
      body = await res.json();
      detail = (body as { error?: string })?.error || JSON.stringify(body);
    } catch {
      detail = res.statusText;
    }
    throw new ApiError(res.status, body, detail || `Request failed (${res.status})`);
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
      ...csrfHeader(),
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
    headers: { ...authHeader(), ...csrfHeader() }, // do NOT set Content-Type; browser sets boundary
    body: form,
  });
  return handle<T>(res);
}
