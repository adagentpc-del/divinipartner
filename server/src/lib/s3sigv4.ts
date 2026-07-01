/**
 * Self-contained AWS Signature Version 4 signer for S3-compatible REST APIs.
 *
 * Works with AWS S3, Cloudflare R2, Backblaze B2 (S3 endpoint), and MinIO. No
 * SDK and no dependencies: node:crypto HMAC-SHA256 plus global fetch. Uses
 * path-style addressing (endpoint/bucket/key) so it works with any custom
 * endpoint without DNS bucket subdomains.
 *
 * Zero em dashes.
 */
import crypto from "node:crypto";

export interface S3Config {
  endpoint: string; // e.g. https://s3.us-east-1.amazonaws.com or https://<acct>.r2.cloudflarestorage.com
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
}

export interface SignedRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
}

const SERVICE = "s3";
const ALGORITHM = "AWS4-HMAC-SHA256";

function sha256Hex(data: Buffer | string): string {
  return crypto.createHash("sha256").update(data).digest("hex");
}

function hmac(key: Buffer | string, data: string): Buffer {
  return crypto.createHmac("sha256", key).update(data, "utf8").digest();
}

/** YYYYMMDD and YYYYMMDDTHHMMSSZ stamps from a Date. */
function amzDates(now: Date): { dateStamp: string; amzDate: string } {
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
  return { dateStamp, amzDate };
}

/** RFC 3986 encode each path segment, preserving slashes between segments. */
function encodeKey(key: string): string {
  return key
    .split("/")
    .map((seg) => encodeURIComponent(seg).replace(/[!'()*]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase()))
    .join("/");
}

function deriveSigningKey(secret: string, dateStamp: string, region: string): Buffer {
  const kDate = hmac("AWS4" + secret, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, SERVICE);
  return hmac(kService, "aws4_request");
}

/**
 * Sign an S3 REST request with SigV4 (signed headers, payload hash in
 * x-amz-content-sha256). Returns the URL, method, and headers to pass to fetch.
 */
export function signS3Request(opts: {
  cfg: S3Config;
  method: string;
  key: string; // object key (no leading slash)
  payload?: Buffer; // request body for PUT; empty for GET/DELETE
  contentType?: string;
  now?: Date;
}): SignedRequest {
  const { cfg, method } = opts;
  const payload = opts.payload ?? Buffer.alloc(0);
  const now = opts.now ?? new Date();
  const { dateStamp, amzDate } = amzDates(now);

  const base = cfg.endpoint.replace(/\/+$/, "");
  const host = new URL(base).host;
  const canonicalUri = "/" + encodeKey(cfg.bucket) + "/" + encodeKey(opts.key.replace(/^\/+/, ""));
  const url = base + canonicalUri;

  const payloadHash = sha256Hex(payload);

  const baseHeaders: Record<string, string> = {
    host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
  };
  if (opts.contentType) baseHeaders["content-type"] = opts.contentType;

  // Canonical headers must be sorted by lowercased header name.
  const sortedHeaderNames = Object.keys(baseHeaders).sort();
  const canonicalHeaders =
    sortedHeaderNames.map((h) => `${h}:${baseHeaders[h].trim()}`).join("\n") + "\n";
  const signedHeaders = sortedHeaderNames.join(";");

  const canonicalRequest = [
    method,
    canonicalUri,
    "", // canonical query string (none)
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const credentialScope = `${dateStamp}/${cfg.region}/${SERVICE}/aws4_request`;
  const stringToSign = [
    ALGORITHM,
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join("\n");

  const signingKey = deriveSigningKey(cfg.secretAccessKey, dateStamp, cfg.region);
  const signature = crypto.createHmac("sha256", signingKey).update(stringToSign, "utf8").digest("hex");

  const authorization =
    `${ALGORITHM} Credential=${cfg.accessKeyId}/${credentialScope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return {
    url,
    method,
    headers: { ...baseHeaders, Authorization: authorization },
  };
}
