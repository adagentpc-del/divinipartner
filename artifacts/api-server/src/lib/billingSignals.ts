// ===========================================================================
// Billing-signal parser for quote / spec PDFs (Section 21).
// ---------------------------------------------------------------------------
// Goal: detect currency, VAT/tax, totals, and overseas billing cues with
//       MINIMAL token usage.
// Design:
//   1. Deterministic regex pass over chunked text (zero AI cost). Handles
//      ~all real quotes which use standard currency symbols / VAT wording.
//   2. AI fallback runs ONLY when regex finds zero currency or contradictory
//      tax wording. Uses a single tightly-chunked payload, ~120 token output
//      cap, structured JSON. No long narrative.
//   3. Re-uses extracted text from quote_assets.extracted_text on rerun
//      (caller is responsible for wiring this — this lib just operates on
//      pages it is given).
// ===========================================================================

import { PDF_LIMITS, stripBoilerplate, selectRelevantChunks } from "./deckExtraction";
import { getOpenAIRestConfig, getModelForTask } from "./aiModels";

export type ParseSource = "rules" | "ai" | "none" | "failed";

export interface BillingSignals {
  currency: string | null;                 // USD | EUR | GBP | AED | CAD | AUD
  currencyConfidence: "high" | "low" | "ambiguous" | null;
  taxLabel: string | null;                 // "VAT" | "Sales Tax" | "GST"
  taxRate: number | null;                  // 0.20 for 20%
  taxAmount: number | null;
  taxInclusive: boolean | null;            // null = unknown
  subtotalAmount: number | null;
  totalAmount: number | null;
  quoteReference: string | null;
  supplierName: string | null;
  paymentTerms: string | null;
  depositAmount: number | null;
  billingCountry: string | null;
  incoterm: string | null;
  billingNotes: string | null;
  flags: string[];                         // currency_detected, vat_detected, tax_ambiguous, etc.
  missingFields: string[];                 // e.g. ['subtotal','currency']
  source: ParseSource;
  aiTokensInput?: number;
  aiTokensOutput?: number;
}

// ---------------------------------------------------------------------------
// Currency detection
// ---------------------------------------------------------------------------
const CURRENCY_PATTERNS: Array<{ code: string; rx: RegExp; weight: number }> = [
  { code: "EUR", rx: /€|\bEUR\b|\beuro(?:s)?\b/gi, weight: 1 },
  { code: "GBP", rx: /£|\bGBP\b|\bpound(?:s)?\s*sterling\b|\bpounds?\b/gi, weight: 1 },
  { code: "AED", rx: /\bAED\b|\bdirham(?:s)?\b|\bdhs\b/gi, weight: 1 },
  { code: "CAD", rx: /\bCAD\b|\bC\$\b|\bCDN\$\b|\bcanadian\s+dollar(?:s)?\b/gi, weight: 1 },
  { code: "AUD", rx: /\bAUD\b|\bA\$\b|\baustralian\s+dollar(?:s)?\b/gi, weight: 1 },
  // USD/$ matched LAST and with lower weight — `$` alone is the most ambiguous
  // signal because EUR/GBP/AED/CAD/AUD documents may also reference $ as a
  // generic prefix. Explicit "USD" still wins outright.
  { code: "USD", rx: /\bUSD\b|\bUS\$\b|\bU\.S\.\s*dollar(?:s)?\b/gi, weight: 2 },
  { code: "USD", rx: /\$(?!\s*(?:CAD|AUD|C|A|US|HK|NZ))/g, weight: 1 },
];

function detectCurrency(text: string): { currency: string | null; confidence: "high" | "low" | "ambiguous" | null; flags: string[] } {
  const flags: string[] = [];
  const counts = new Map<string, number>();
  for (const { code, rx, weight } of CURRENCY_PATTERNS) {
    const matches = text.match(rx);
    if (matches) counts.set(code, (counts.get(code) || 0) + matches.length * weight);
  }
  if (counts.size === 0) return { currency: null, confidence: null, flags: [] };
  const sorted = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  const [topCode, topCount] = sorted[0];
  flags.push("currency_detected");
  if (sorted.length === 1) return { currency: topCode, confidence: "high", flags };
  const [, secondCount] = sorted[1];
  // If two or more currencies tie or the second is ≥50% of the top → ambiguous.
  if (secondCount >= topCount * 0.5) {
    flags.push("currency_ambiguous", "manual_review_needed");
    return { currency: topCode, confidence: "ambiguous", flags };
  }
  return { currency: topCode, confidence: "low", flags };
}

// ---------------------------------------------------------------------------
// Tax detection
// ---------------------------------------------------------------------------
const TAX_KEYWORDS: Array<{ label: string; rx: RegExp }> = [
  { label: "VAT", rx: /\bVAT\b|\bvalue[-\s]*added[-\s]*tax\b/i },
  { label: "Sales Tax", rx: /\bsales\s*tax\b/i },
  { label: "GST", rx: /\bGST\b|\bgoods\s*(?:and|&)\s*services\s*tax\b/i },
];
const TAX_INCLUSIVE_RX = /\b(?:incl(?:usive|udes|uding)?|including)\b[^.]{0,40}\b(?:vat|tax|gst)\b|\b(?:vat|tax|gst)\b[^.]{0,30}\b(?:incl(?:usive|uded|usively)?|including)\b/i;
const TAX_EXCLUSIVE_RX = /\b(?:excl(?:usive|udes|uding)?|excluding|not\s+included|added\s+at\s+checkout)\b[^.]{0,40}\b(?:vat|tax|gst)\b|\b(?:vat|tax|gst)\b[^.]{0,30}\b(?:excl(?:usive|uded|usively)?|excluding|not\s+included|added)\b/i;
const TAX_RATE_RX = /\b(?:vat|tax|gst)[\s:@]*([0-9]{1,2}(?:\.[0-9]+)?)\s*%/i;
const TAX_AMOUNT_RX = /\b(?:vat|tax|gst)[\s:]*[€£$]?\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)\b/i;

function detectTax(text: string): {
  label: string | null; rate: number | null; amount: number | null; inclusive: boolean | null; flags: string[];
} {
  const flags: string[] = [];
  let label: string | null = null;
  for (const { label: l, rx } of TAX_KEYWORDS) { if (rx.test(text)) { label = l; break; } }
  if (!label) return { label: null, rate: null, amount: null, inclusive: null, flags: [] };
  flags.push("vat_detected");

  let inclusive: boolean | null = null;
  const inc = TAX_INCLUSIVE_RX.test(text);
  const exc = TAX_EXCLUSIVE_RX.test(text);
  if (inc && !exc) inclusive = true;
  else if (exc && !inc) inclusive = false;
  else if (inc && exc) flags.push("tax_ambiguous");

  let rate: number | null = null;
  const rateMatch = text.match(TAX_RATE_RX);
  if (rateMatch) {
    const pct = parseFloat(rateMatch[1]);
    if (pct >= 0 && pct <= 50) rate = +(pct / 100).toFixed(3);
  }

  let amount: number | null = null;
  const amtMatch = text.match(TAX_AMOUNT_RX);
  if (amtMatch) {
    const n = parseFloat(amtMatch[1].replace(/,/g, ""));
    if (!isNaN(n) && n > 0) amount = n;
  }

  if (inclusive === null && rate === null && amount === null) {
    flags.push("tax_ambiguous");
  }
  return { label, rate, amount, inclusive, flags };
}

// ---------------------------------------------------------------------------
// Money totals
// ---------------------------------------------------------------------------
function parseMoney(s: string): number | null {
  const cleaned = s.replace(/[^\d.,]/g, "");
  if (!cleaned) return null;
  // Treat thousands separators: "1,250.50" or European "1.250,50" → take last separator as decimal.
  const lastComma = cleaned.lastIndexOf(",");
  const lastDot = cleaned.lastIndexOf(".");
  let normalized: string;
  if (lastComma > lastDot) {
    normalized = cleaned.replace(/\./g, "").replace(",", ".");
  } else {
    normalized = cleaned.replace(/,/g, "");
  }
  const n = parseFloat(normalized);
  return isNaN(n) ? null : n;
}

const SUBTOTAL_RX = /\b(?:sub[-\s]*total|subtotal|net\s+total|net\s+amount)\b[^\n]{0,40}?([€£$]?\s*[0-9][0-9.,]*)/i;
const TOTAL_RX = /\b(?:grand\s+total|total\s+(?:due|amount|payable)|total)\b[^\n]{0,40}?([€£$]?\s*[0-9][0-9.,]*)/i;
const DEPOSIT_RX = /\b(?:deposit|down[-\s]*payment|advance\s+payment)\b[^\n]{0,40}?([€£$]?\s*[0-9][0-9.,]*)/i;

// ---------------------------------------------------------------------------
// Quote ref / payment terms / overseas cues
// ---------------------------------------------------------------------------
const QUOTE_REF_RX = /\b(?:quote|quotation|invoice|estimate|proposal)\s*(?:no\.?|number|#|ref(?:erence)?\.?)\s*[:\-]?\s*([A-Z0-9][A-Z0-9\-_/]{2,20})\b/i;
const PAYMENT_TERMS_RX = /\b(net\s*\d{1,3}|due\s+on\s+receipt|prepaid|advance\s+payment|payment\s+terms?\s*[:\-]?\s*[^\n]{1,60})\b/i;
const COUNTRY_RX = /\b(United\s+Kingdom|UK|GB|Great\s+Britain|United\s+Arab\s+Emirates|UAE|Dubai|Abu\s+Dhabi|Canada|Australia|Germany|France|Spain|Italy|Netherlands|Ireland|Singapore|Hong\s+Kong|Japan)\b/i;
const COUNTRY_TO_CODE: Record<string, string> = {
  "united kingdom": "GB", "uk": "GB", "gb": "GB", "great britain": "GB",
  "united arab emirates": "AE", "uae": "AE", "dubai": "AE", "abu dhabi": "AE",
  "canada": "CA", "australia": "AU", "germany": "DE", "france": "FR",
  "spain": "ES", "italy": "IT", "netherlands": "NL", "ireland": "IE",
  "singapore": "SG", "hong kong": "HK", "japan": "JP",
};
const INCOTERM_RX = /\b(EXW|FOB|FCA|CIF|CIP|CPT|DAP|DDP|DAT|DPU)\b/;
const OVERSEAS_CUES_RX = /\b(custom(?:s)?|duties|export|overseas|international\s+shipping|incoterm|freight\s+forward)\b/i;

// ---------------------------------------------------------------------------
// Main entry: deterministic-first parse over already-extracted PDF page text.
// ---------------------------------------------------------------------------
export interface ParseInput {
  pages: { page: number; text: string }[];
  /** When true, billing keywords are required to attempt AI fallback. Default true. */
  aiFallbackEnabled?: boolean;
}

const BILLING_KEYWORDS_RX = /\b(?:total|subtotal|VAT|tax|GST|invoice|quote|quotation|estimate|amount|deposit|payment|incoterm|EUR|GBP|USD|AED|CAD|AUD|€|£)\b/i;

export async function parseBillingSignals(input: ParseInput): Promise<BillingSignals> {
  const cleaned = stripBoilerplate(input.pages);
  // Reuse existing chunker, then keep ONLY pages with billing keywords for AI/regex.
  // This further trims the AI payload — most quote PDFs put pricing on 1-2 pages.
  const chunks = selectRelevantChunks(cleaned)
    .filter(c => BILLING_KEYWORDS_RX.test(c.text));
  const billingPages = chunks.length ? chunks : cleaned.filter(p => BILLING_KEYWORDS_RX.test(p.text)).slice(0, 4);
  const text = billingPages.map(p => p.text).join("\n\n");

  const flags: string[] = [];
  const missing: string[] = [];

  const { currency, confidence: currencyConfidence, flags: cFlags } = detectCurrency(text);
  flags.push(...cFlags);

  const tax = detectTax(text);
  flags.push(...tax.flags);

  const subM = text.match(SUBTOTAL_RX);
  const totM = text.match(TOTAL_RX);
  const depM = text.match(DEPOSIT_RX);
  const subtotalAmount = subM ? parseMoney(subM[1]) : null;
  const totalAmount = totM ? parseMoney(totM[1]) : null;
  const depositAmount = depM ? parseMoney(depM[1]) : null;
  if (totalAmount && !subtotalAmount) flags.push("total_without_subtotal");

  const refM = text.match(QUOTE_REF_RX);
  const ptM = text.match(PAYMENT_TERMS_RX);
  const ctyM = text.match(COUNTRY_RX);
  const incoM = text.match(INCOTERM_RX);

  let billingCountry: string | null = null;
  if (ctyM) billingCountry = COUNTRY_TO_CODE[ctyM[1].toLowerCase()] || ctyM[1];
  const isOverseas = OVERSEAS_CUES_RX.test(text) || (billingCountry && billingCountry !== "US");
  if (isOverseas) flags.push("overseas_cues_detected");

  if (!currency) missing.push("currency");
  if (!subtotalAmount) missing.push("subtotal");
  if (!totalAmount) missing.push("total");
  if (!tax.label) missing.push("tax");

  // Did regex find enough? AI fallback only if we have NO currency at all,
  // or we have tax keywords with `tax_ambiguous` flag.
  let source: ParseSource = "rules";
  let aiTokensInput: number | undefined;
  let aiTokensOutput: number | undefined;
  let aiCurrency: string | null = null;
  let aiTax: ReturnType<typeof detectTax> | null = null;
  const needsAi = input.aiFallbackEnabled !== false && (
    (!currency && billingPages.length > 0) ||
    flags.includes("tax_ambiguous")
  );
  if (needsAi) {
    const aiResult = await runAiFallback(billingPages);
    if (aiResult) {
      source = "ai";
      aiTokensInput = aiResult.tokensIn;
      aiTokensOutput = aiResult.tokensOut;
      aiCurrency = aiResult.currency || null;
      if (aiResult.tax) aiTax = { label: aiResult.tax.label, rate: aiResult.tax.rate, amount: aiResult.tax.amount, inclusive: aiResult.tax.inclusive, flags: [] };
    } else {
      // AI unavailable — keep what regex got, mark for review.
      if (!currency) flags.push("manual_review_needed");
    }
  }

  if (billingPages.length === 0) {
    source = "none";
    flags.push("manual_review_needed");
  }

  return {
    currency: aiCurrency || currency,
    currencyConfidence: aiCurrency ? "high" : currencyConfidence,
    taxLabel: aiTax?.label || tax.label,
    taxRate: aiTax?.rate ?? tax.rate,
    taxAmount: aiTax?.amount ?? tax.amount,
    taxInclusive: aiTax?.inclusive ?? tax.inclusive,
    subtotalAmount,
    totalAmount,
    quoteReference: refM ? refM[1].trim() : null,
    supplierName: null, // regex too noisy; left to admin or supplierId field.
    paymentTerms: ptM ? ptM[0].trim().substring(0, 120) : null,
    depositAmount,
    billingCountry,
    incoterm: incoM ? incoM[1] : null,
    billingNotes: isOverseas ? "Overseas billing cues detected — review duties / Incoterm." : null,
    flags: Array.from(new Set(flags)),
    missingFields: missing,
    source,
    aiTokensInput,
    aiTokensOutput,
  };
}

// ---------------------------------------------------------------------------
// AI fallback — short structured prompt, hard token cap.
// ---------------------------------------------------------------------------
const AI_MAX_OUTPUT_TOKENS = 200;       // billing signals are tiny; 200 is plenty
const AI_MAX_INPUT_CHARS = 4_000;       // smaller than deck extractor — we only need pricing pages

async function runAiFallback(billingPages: { page: number; text: string }[]): Promise<{
  currency: string | null;
  tax: { label: string | null; rate: number | null; amount: number | null; inclusive: boolean | null } | null;
  tokensIn: number;
  tokensOut: number;
} | null> {
  const cfg = getOpenAIRestConfig();
  if (!cfg) return null;
  const { baseUrl, apiKey } = cfg;
  let payload = billingPages.map(p => `--- p${p.page} ---\n${p.text}`).join("\n\n");
  if (payload.length > AI_MAX_INPUT_CHARS) payload = payload.substring(0, AI_MAX_INPUT_CHARS);
  const model = getModelForTask("billingSignals");
  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model, temperature: 0, max_tokens: AI_MAX_OUTPUT_TOKENS,
        response_format: { type: "json_object" },
        messages: [
          // Tight prompt: no narrative, only the few fields regex couldn't resolve.
          { role: "system", content:
            'Return JSON {"currency":"USD|EUR|GBP|AED|CAD|AUD|null","tax":{"label":"VAT|Sales Tax|GST|null","ratePct":number|null,"amount":number|null,"inclusive":true|false|null}}. ' +
            'Use only what is explicitly stated. Null when unclear. No prose.' },
          { role: "user", content: payload },
        ],
      }),
    });
    if (!res.ok) { console.error("billingSignals AI failed", await res.text()); return null; }
    const data = await res.json() as any;
    const content = data.choices?.[0]?.message?.content;
    if (!content) return null;
    const j = JSON.parse(content);
    return {
      currency: j.currency && /^(USD|EUR|GBP|AED|CAD|AUD)$/.test(j.currency) ? j.currency : null,
      tax: j.tax ? {
        label: j.tax.label || null,
        rate: typeof j.tax.ratePct === "number" ? +(j.tax.ratePct / 100).toFixed(3) : null,
        amount: typeof j.tax.amount === "number" ? j.tax.amount : null,
        inclusive: typeof j.tax.inclusive === "boolean" ? j.tax.inclusive : null,
      } : null,
      tokensIn: data.usage?.prompt_tokens || 0,
      tokensOut: data.usage?.completion_tokens || 0,
    };
  } catch (e) { console.error("billingSignals AI error", e); return null; }
}

// ---------------------------------------------------------------------------
// Convenience: parse from a raw PDF buffer (used by upload route).
// Returns null if buffer exceeds limits or pdf-parse fails.
// ---------------------------------------------------------------------------
export async function parseBillingSignalsFromPdf(buf: Buffer): Promise<{ signals: BillingSignals; extractedText: string } | null> {
  if (buf.length > PDF_LIMITS.MAX_FILE_BYTES) return null;
  let PDFParseCls: typeof import("pdf-parse").PDFParse;
  try { PDFParseCls = (await import("pdf-parse")).PDFParse; }
  catch { return null; }
  let parsed: { text: string };
  try { parsed = await new PDFParseCls({ data: buf }).getText(); }
  catch (e) { console.error("billingSignals pdf-parse failed", e); return null; }
  // pdf-parse gives one big string; split heuristically by form-feed or "Page N".
  const raw = (parsed.text || "").substring(0, PDF_LIMITS.MAX_TEXT_CHARS);
  const splits = raw.split(/\f|\n\s*Page\s+\d+\s*\n/);
  const pages = splits.map((t: string, i: number) => ({ page: i + 1, text: t.trim() })).filter((p: { text: string }) => p.text);
  const signals = await parseBillingSignals({ pages });
  return { signals, extractedText: raw };
}
