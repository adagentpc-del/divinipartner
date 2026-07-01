/**
 * Device fingerprinting + visitor-signal reporting.
 *
 * getFingerprint() computes a stable, hashed device fingerprint from navigator,
 * screen, timezone, and a canvas signature, hashed with SHA-256 to a hex
 * string and cached in memory for the page lifetime.
 *
 * reportSignal(path) POSTs the fingerprint plus the current path, any utm_*
 * query params, and basic client hints to /api/signals. It fails silently on
 * any error so it can never break the page. See the Privacy Policy for the
 * disclosure of this collection.
 *
 * Zero em dashes.
 */
import { getToken } from './api';

const BASE = (import.meta.env.BASE_URL || '/').replace(/\/$/, '');

let cached: string | null = null;
let inflight: Promise<string> | null = null;

/** A canvas-rendered signature string (best-effort; '' if unavailable). */
function canvasSignature(): string {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 240;
    canvas.height = 60;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';
    ctx.textBaseline = 'top';
    ctx.font = "14px 'Arial'";
    ctx.fillStyle = '#1f3d31';
    ctx.fillRect(2, 2, 120, 24);
    ctx.fillStyle = '#c9a35b';
    ctx.fillText('Divini Partners ✨ fp', 4, 4);
    ctx.strokeStyle = 'rgba(31,61,49,0.6)';
    ctx.beginPath();
    ctx.arc(180, 30, 18, 0, Math.PI * 2);
    ctx.stroke();
    return canvas.toDataURL();
  } catch {
    return '';
  }
}

/** Concatenate the device characteristics into one stable raw string. */
function rawSignals(): string {
  const nav = typeof navigator !== 'undefined' ? navigator : ({} as Navigator);
  const scr = typeof screen !== 'undefined' ? screen : ({} as Screen);
  let timezone = '';
  try {
    timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
  } catch {
    timezone = '';
  }
  const parts: (string | number | undefined)[] = [
    nav.userAgent,
    nav.language,
    Array.isArray(nav.languages) ? nav.languages.join(',') : '',
    (nav as Navigator & { platform?: string }).platform,
    nav.hardwareConcurrency,
    (nav as Navigator & { deviceMemory?: number }).deviceMemory,
    scr.width,
    scr.height,
    scr.colorDepth,
    typeof window !== 'undefined' ? window.devicePixelRatio : '',
    timezone,
    canvasSignature(),
  ];
  return parts.map((p) => (p === undefined || p === null ? '' : String(p))).join('||');
}

/** SHA-256 hex of the input string via SubtleCrypto. */
async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Compute (and cache) the device fingerprint. */
export async function getFingerprint(): Promise<string> {
  if (cached) return cached;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const hex = await sha256Hex(rawSignals());
      cached = hex;
      return hex;
    } catch {
      // Fall back to a non-crypto hash so we still return something usable.
      const raw = rawSignals();
      let hash = 0;
      for (let i = 0; i < raw.length; i++) {
        hash = (hash << 5) - hash + raw.charCodeAt(i);
        hash |= 0;
      }
      cached = `fallback_${(hash >>> 0).toString(16)}`;
      return cached;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

/** Collect utm_* params from the current query string. */
function readUtm(): Record<string, string> {
  const out: Record<string, string> = {};
  try {
    const params = new URLSearchParams(window.location.search);
    params.forEach((value, key) => {
      if (key.toLowerCase().startsWith('utm_') && value) {
        out[key] = value.slice(0, 256);
      }
    });
  } catch {
    /* ignore */
  }
  return out;
}

/** Basic, non-sensitive client hints to aid attribution. */
function clientHints(): Record<string, string | number | boolean> {
  const hints: Record<string, string | number | boolean> = {};
  try {
    hints.screen = `${screen.width}x${screen.height}`;
    hints.pixelRatio = window.devicePixelRatio;
    hints.language = navigator.language;
    hints.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    hints.platform = (navigator as Navigator & { platform?: string }).platform || '';
  } catch {
    /* ignore */
  }
  return hints;
}

function authHeader(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/**
 * Report one visitor signal for the given path. Best-effort and silent: any
 * error is swallowed so it can never break the page.
 */
export async function reportSignal(path: string): Promise<void> {
  try {
    const fingerprint = await getFingerprint();
    const body = {
      fingerprint,
      path,
      utm: readUtm(),
      client_hints: clientHints(),
    };
    await fetch(`${BASE}/api/signals`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...authHeader(),
      },
      body: JSON.stringify(body),
      keepalive: true,
    });
  } catch {
    /* fail silently, never break the page */
  }
}
