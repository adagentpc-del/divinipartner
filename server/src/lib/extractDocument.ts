/**
 * Extract plain text from an uploaded document buffer, so the same LLM
 * structuring used for website extraction (lib/extract.ts) can also read a
 * vendor/venue's rate sheet, floor plan PDF, or menu.
 *
 * Supported today: plain text (.txt) and PDF (.pdf, via pdf-parse - the one
 * exception to this codebase's "no SDK / fetch-only" convention: parsing the
 * PDF binary format is not something worth hand-rolling the way the Stripe/S3
 * REST calls are).
 *
 * Unsupported formats (.docx, images, etc.) return null so the caller falls
 * back to the existing safe "document on file, verify manually" behavior.
 * Never throws; a parse failure is the same as "unsupported" to the caller.
 *
 * Zero em dashes.
 */
import { PDFParse } from "pdf-parse";

const MAX_TEXT_CHARS = 20_000;

export type SupportedDocKind = "text" | "pdf" | null;

/** Classify a document by content-type first, falling back to the file extension. */
export function classifyDocument(contentType: string | null | undefined, fileName: string | null | undefined): SupportedDocKind {
  const ct = (contentType || "").toLowerCase();
  const ext = (fileName || "").toLowerCase().split(".").pop() || "";
  if (ct.includes("pdf") || ext === "pdf") return "pdf";
  if (ct.startsWith("text/") || ext === "txt") return "text";
  return null;
}

/** Extract plain text from a document buffer. Returns null when unsupported or
 *  extraction fails; never throws. */
export async function extractTextFromDocument(
  buffer: Buffer,
  contentType: string | null | undefined,
  fileName: string | null | undefined,
): Promise<string | null> {
  const kind = classifyDocument(contentType, fileName);
  if (!kind) return null;
  try {
    if (kind === "text") {
      const text = buffer.toString("utf8").trim();
      return text.length > 0 ? text.slice(0, MAX_TEXT_CHARS) : null;
    }
    if (kind === "pdf") {
      const parser = new PDFParse({ data: buffer });
      const parsed = await parser.getText();
      const text = (parsed.text || "").trim();
      return text.length > 0 ? text.slice(0, MAX_TEXT_CHARS) : null;
    }
    return null;
  } catch {
    return null;
  }
}
