/**
 * Upload Protection layer for Divini Partners (security spec).
 *
 * A reusable, dependency-free guard for everything that enters the system as a
 * file or a file reference. The app today stores uploads mostly as URL
 * references (documents.file_url, sponsor logo/ad urls, w9_doc_url) rather than
 * binary bytes, so two validation paths exist:
 *
 *   - validateFileMeta()  : extension + mimetype + size allowlist checks for any
 *                           endpoint that has file metadata (name, type, size).
 *   - validateUrlUpload() : http(s) + path-extension allowlist for the URL-only
 *                           reference uploads this app actually uses.
 *
 * Two further helpers are exported for the day a genuine BINARY (multipart)
 * upload endpoint is added:
 *
 *   - sniffMagicBytes()   : verify the leading bytes match the declared type so a
 *                           spoofed extension (e.g. invoice.pdf that is really an
 *                           .exe) is caught.
 *   - scanWithClamAV()    : the VIRUS SCAN SEAM. OFF by default; only runs when
 *                           AV_SCAN_ENABLED='true' and clamav-daemon is installed.
 *
 * Everything here is deterministic and pure where possible. No new npm packages:
 * node built-ins only (node:path, node:child_process). Zero em dashes.
 */
import path from "node:path";
import { execFile } from "node:child_process";

// ---------------------------------------------------------------------------
// Allowlists + limits
// ---------------------------------------------------------------------------

/**
 * Max upload size in bytes. Default 25 MB, configurable via UPLOAD_MAX_BYTES.
 * Parsed once; an invalid/negative value falls back to the default.
 */
const DEFAULT_MAX_BYTES = 25 * 1024 * 1024;
export const MAX_UPLOAD_BYTES: number = (() => {
  const raw = Number(process.env.UPLOAD_MAX_BYTES);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : DEFAULT_MAX_BYTES;
})();

/**
 * Allowed extensions (lowercase, no dot) grouped by family. "documents" covers
 * COI / W-9 / agreements / data exports; "images" covers logos + ad creatives.
 * The union of both is the default allowlist for a generic upload.
 */
export const ALLOWED_EXT = {
  documents: ["pdf", "png", "jpg", "jpeg", "doc", "docx", "csv"],
  images: ["png", "jpg", "jpeg", "svg"],
} as const;

/** Convenience union of every allowed extension. */
export const ALLOWED_EXT_ALL: readonly string[] = Array.from(
  new Set<string>([...ALLOWED_EXT.documents, ...ALLOWED_EXT.images]),
);

/**
 * Allowed MIME types, mapped to the extension family each one represents. The
 * mapping lets validateFileMeta() confirm that a declared mimetype actually
 * matches the declared extension (e.g. a .pdf claiming image/png is rejected).
 */
export const ALLOWED_MIME: Record<string, readonly string[]> = {
  "application/pdf": ["pdf"],
  "image/png": ["png"],
  "image/jpeg": ["jpg", "jpeg"],
  "image/jpg": ["jpg", "jpeg"], // some clients send the non-standard image/jpg
  "image/svg+xml": ["svg"],
  "text/csv": ["csv"],
  "application/csv": ["csv"],
  "text/plain": ["csv"], // many browsers label .csv as text/plain
  "application/msword": ["doc"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ["docx"],
};

/**
 * Extensions that must NEVER be accepted, even if some caller adds them to an
 * allowlist by mistake. Scripts, executables, and archives that could hide them.
 */
export const BLOCKED_EXT: readonly string[] = [
  "exe", "dll", "bat", "cmd", "com", "msi", "scr", "pif",
  "sh", "bash", "zsh", "ps1", "psm1", "vbs", "js", "mjs", "cjs", "jar",
  "php", "phtml", "asp", "aspx", "jsp", "py", "rb", "pl", "cgi",
  "htm", "html", "svgz", "swf", "app", "deb", "rpm", "dmg",
];

export type GuardResult = { ok: boolean; reason?: string };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Lowercase extension without the leading dot, or "" when none. */
export function extOf(filename: string): string {
  const base = path.basename(String(filename || "").trim());
  const dot = base.lastIndexOf(".");
  if (dot <= 0 || dot === base.length - 1) return "";
  return base.slice(dot + 1).toLowerCase();
}

/** Normalize a declared mimetype: lowercase, strip any "; charset=..." suffix. */
function normalizeMime(mimetype: string): string {
  return String(mimetype || "").toLowerCase().split(";")[0].trim();
}

// ---------------------------------------------------------------------------
// validateFileMeta: extension + mimetype + size
// ---------------------------------------------------------------------------

/**
 * Validate file metadata against the allowlists. Pure and deterministic.
 *
 * Checks, in order:
 *   1. filename present and has an extension
 *   2. extension is not on the hard blocklist
 *   3. extension is in the allowlist (optionally constrained to one family)
 *   4. mimetype is in the allowlist
 *   5. the mimetype's family contains the declared extension (anti-spoof)
 *   6. size is a positive number within MAX_UPLOAD_BYTES
 *
 * @param opts.allow  Optional family ("documents" | "images") to constrain to;
 *                    omit to allow the full union.
 */
export function validateFileMeta(opts: {
  filename: string;
  mimetype: string;
  sizeBytes: number;
  allow?: keyof typeof ALLOWED_EXT;
}): GuardResult {
  const filename = String(opts.filename || "").trim();
  if (!filename) return { ok: false, reason: "filename is required" };

  const ext = extOf(filename);
  if (!ext) return { ok: false, reason: "file has no extension" };
  if (BLOCKED_EXT.includes(ext)) {
    return { ok: false, reason: `file type .${ext} is not allowed` };
  }

  const allowedExts: readonly string[] = opts.allow ? ALLOWED_EXT[opts.allow] : ALLOWED_EXT_ALL;
  if (!allowedExts.includes(ext)) {
    return { ok: false, reason: `extension .${ext} is not in the allowlist` };
  }

  const mime = normalizeMime(opts.mimetype);
  if (!mime) return { ok: false, reason: "mimetype is required" };
  const mimeExts = ALLOWED_MIME[mime];
  if (!mimeExts) {
    return { ok: false, reason: `mimetype ${mime} is not in the allowlist` };
  }
  if (!mimeExts.includes(ext)) {
    return { ok: false, reason: `mimetype ${mime} does not match extension .${ext}` };
  }

  const size = Number(opts.sizeBytes);
  if (!Number.isFinite(size) || size <= 0) {
    return { ok: false, reason: "file size is missing or invalid" };
  }
  if (size > MAX_UPLOAD_BYTES) {
    return {
      ok: false,
      reason: `file is too large (${size} bytes, max ${MAX_UPLOAD_BYTES})`,
    };
  }

  return { ok: true };
}

// ---------------------------------------------------------------------------
// sniffMagicBytes: anti-spoof on actual bytes (binary endpoints only)
// ---------------------------------------------------------------------------

/**
 * Verify the file's leading bytes match the declared extension for common types.
 * Only meaningful when the real bytes are available (a binary/multipart upload).
 *
 * Returns true when the magic bytes are consistent with the declared extension,
 * or when the type has no reliable signature we check (doc/docx/csv/svg are text
 * or container formats with no single magic number, so they pass this stage and
 * rely on validateFileMeta + scanWithClamAV instead).
 */
export function sniffMagicBytes(buf: Buffer, declaredExt: string): boolean {
  const ext = String(declaredExt || "").toLowerCase().replace(/^\./, "");
  if (!Buffer.isBuffer(buf) || buf.length < 4) return false;

  const startsWith = (sig: number[]): boolean =>
    buf.length >= sig.length && sig.every((b, i) => buf[i] === b);

  switch (ext) {
    case "pdf":
      // "%PDF"
      return startsWith([0x25, 0x50, 0x44, 0x46]);
    case "png":
      // \x89 P N G \r \n \x1a \n
      return startsWith([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    case "jpg":
    case "jpeg":
      // FF D8 FF
      return startsWith([0xff, 0xd8, 0xff]);
    case "docx":
      // OOXML is a ZIP container: "PK\x03\x04"
      return startsWith([0x50, 0x4b, 0x03, 0x04]);
    case "doc":
      // Legacy OLE compound file: D0 CF 11 E0 A1 B1 1A E1
      return startsWith([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
    case "csv":
    case "svg":
      // Text formats with no reliable single signature; defer to meta + AV scan.
      return true;
    default:
      // Unknown-to-us type: do not claim a match.
      return false;
  }
}

// ---------------------------------------------------------------------------
// validateUrlUpload: URL-reference uploads (what this app uses today)
// ---------------------------------------------------------------------------

/**
 * Validate a URL-reference upload. The app stores uploads as URLs (documents.
 * file_url, sponsor logo/ad, w9_doc_url), so this guards the URL itself:
 *   - must parse as an absolute http(s) URL
 *   - the path's extension must be in the allowlist (when present)
 *   - the path's extension must not be on the script/exe blocklist
 *
 * A URL with no file extension in its path is allowed (many hosted/object-store
 * links and tokenized download URLs carry no extension); the goal is to reject
 * the dangerous and clearly-wrong, not to mandate a clean extension.
 *
 * @param opts.allow         Optional family to constrain to.
 * @param opts.requireExt    When true, a URL with no path extension is rejected.
 */
export function validateUrlUpload(
  url: string,
  opts: { allow?: keyof typeof ALLOWED_EXT; requireExt?: boolean } = {},
): GuardResult {
  const raw = String(url || "").trim();
  if (!raw) return { ok: false, reason: "url is required" };

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return { ok: false, reason: "url is not a valid absolute url" };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { ok: false, reason: "url must be http(s)" };
  }

  // The extension is taken from the URL path only (ignore query/fragment).
  const ext = extOf(decodeURIComponent(parsed.pathname));
  if (!ext) {
    if (opts.requireExt) {
      return { ok: false, reason: "url path has no file extension" };
    }
    return { ok: true };
  }
  if (BLOCKED_EXT.includes(ext)) {
    return { ok: false, reason: `url points to a blocked file type .${ext}` };
  }
  const allowedExts: readonly string[] = opts.allow ? ALLOWED_EXT[opts.allow] : ALLOWED_EXT_ALL;
  if (!allowedExts.includes(ext)) {
    return { ok: false, reason: `url extension .${ext} is not in the allowlist` };
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// scanWithClamAV: the VIRUS SCAN SEAM (feature-flagged, OFF by default)
// ---------------------------------------------------------------------------

/**
 * Scan a file on disk with the system ClamAV daemon.
 *
 * SEAM CONTRACT:
 *   - This is OFF by default and NEVER blocks unless explicitly enabled.
 *   - It only runs when AV_SCAN_ENABLED === 'true'. When disabled, or when the
 *     clamdscan binary is missing / errors at the process level, it returns
 *     { clean: true, detail: 'av scan disabled' } (fail-open while unconfigured,
 *     so it cannot break the existing upload flows before clamav is confirmed).
 *   - When ENABLED and clamdscan runs:
 *       exit 0 => clean
 *       exit 1 => infected (clean: false, detail carries the signature line)
 *       exit 2 => scan error (treated as not-clean so a real error is surfaced)
 *
 * REQUIREMENTS TO ENABLE:
 *   1. Install the daemon:  apt-get install clamav-daemon clamav  (then run
 *      freshclam + start clamav-daemon).
 *   2. Set the env flag:    AV_SCAN_ENABLED=true
 *   3. Optionally override the binary path with AV_CLAMDSCAN_PATH (default
 *      'clamdscan', which talks to the running daemon and is fast).
 *
 * Uses node:child_process execFile (no shell, args passed as an array) so the
 * file path cannot be interpreted by a shell. No new npm package.
 */
export async function scanWithClamAV(
  filePath: string,
): Promise<{ clean: boolean; detail?: string }> {
  if (process.env.AV_SCAN_ENABLED !== "true") {
    return { clean: true, detail: "av scan disabled" };
  }
  const bin = process.env.AV_CLAMDSCAN_PATH || "clamdscan";

  return new Promise((resolve) => {
    execFile(
      bin,
      ["--no-summary", "--stdout", filePath],
      { timeout: 60_000, maxBuffer: 1024 * 1024 },
      (err, stdout, stderr) => {
        // execFile sets err.code to the process exit code on a non-zero exit.
        const code =
          err && typeof (err as NodeJS.ErrnoException & { code?: unknown }).code === "number"
            ? Number((err as unknown as { code: number }).code)
            : err
            ? -1
            : 0;

        // Binary missing / spawn failure (ENOENT etc.): do not block, stay open.
        if (err && (err as NodeJS.ErrnoException).code === "ENOENT") {
          return resolve({ clean: true, detail: "av scan disabled (clamdscan not found)" });
        }

        const out = `${stdout || ""}${stderr || ""}`.trim();
        if (code === 0) return resolve({ clean: true, detail: "clamav: OK" });
        if (code === 1) {
          return resolve({ clean: false, detail: out || "clamav: infected" });
        }
        // code === 2 (scan error) or an unexpected spawn error.
        return resolve({ clean: false, detail: out || "clamav: scan error" });
      },
    );
  });
}
