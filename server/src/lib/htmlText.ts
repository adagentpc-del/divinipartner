/**
 * HTML-to-text stripping. PURE, dependency-free (no DB, no config, no node
 * modules) so it can be unit tested in isolation, same rationale as
 * pricingMath.ts / eventScope.ts / ics.ts / availability.ts.
 *
 * Extracted from extract.ts, which re-exports this name so existing callers
 * are unaffected.
 *
 * Zero em dashes.
 */

const MAX_TEXT_CHARS = 12_000; // text handed to the extraction model

/** Strip HTML to readable text. Drops scripts, styles, and tags; collapses space. */
export function htmlToText(html: string): string {
  const noScript = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");
  const text = noScript
    .replace(/<\/(p|div|li|h[1-6]|br|tr|section|article)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return text.slice(0, MAX_TEXT_CHARS);
}
