// ===========================================================================
// Project-request AI summary (cost-optimized).
// ---------------------------------------------------------------------------
// Strategy (mirrors the cost-reduction approach used in deckExtraction.ts /
// packageExtraction.ts / billingSignals.ts):
//
//   1. Compute every deterministic section in code — complexity, timeline,
//      missing-info detection, recommended next step are all pure functions
//      of the input. AI is NEVER asked for these.
//
//   2. Send a compact JSON payload (not a long natural-language prompt) to
//      the model and ask for two short fields only: an "overview" prose
//      blurb and a "risks" array. Hard cap on output tokens.
//
//   3. response_format: json_object so we can parse without prompt-fragility.
//
//   4. Emit usage_events for observability — `request.ai_summary.generated`
//      / `.failed` with token counts so cost is visible alongside the
//      existing `deck.parse.ai`, `package_pdf.parse.ai`, etc. metrics.
//
// The composed output text keeps the same multi-section shape RequestDetail.tsx
// renders today, so the UI is unchanged.
// ===========================================================================

import OpenAI from "openai";
import { logger } from "./logger";
import { emit as usageEmit } from "../services/usageTracking";

// Hard caps tuned for this flow. Output is two small fields, ~150 tokens of
// content; 250 leaves headroom without permitting waste.
const AI_MAX_OUTPUT_TOKENS = 250;
const MODEL = "gpt-4o-mini";

function getOpenAIClient() {
  return new OpenAI({
    baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
    apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  });
}

interface SummaryInput {
  companyName: string;
  contactName: string;
  eventName: string;
  eventDate: string | null;
  venueName: string | null;
  venueAddress: string | null;
  items: { category: string; itemName: string }[];
  designAssistanceRequested: boolean;
  customFabricationRequested: boolean;
  immersiveRequested: boolean;
  promotionalItemsRequested: boolean;
  additionalNotes: string | null;
  uploads: { uploadType: string; fileName: string }[];
}

// Pure date math — no AI needed. Buckets chosen to match how PMs actually
// triage: <2 weeks = urgent, 2-6 weeks = tight, 6-13 weeks = standard.
function computeTimeline(eventDate: string | null): string {
  if (!eventDate) return "Unknown — no event date provided.";
  const d = new Date(eventDate);
  if (isNaN(d.getTime())) return "Unknown — event date unparseable.";
  const days = Math.round((d.getTime() - Date.now()) / 86_400_000);
  if (days < 0) return `Past event (${Math.abs(days)} days ago).`;
  if (days <= 14) return `Urgent — ${days} days to event.`;
  if (days <= 45) return `Tight — ${days} days to event.`;
  if (days <= 90) return `Standard — ${days} days to event.`;
  return `Comfortable — ${days} days to event.`;
}

function computeMissing(input: SummaryInput): string[] {
  const missing: string[] = [];
  if (!input.eventDate) missing.push("Event date");
  if (!input.venueName && !input.venueAddress) missing.push("Venue details");
  if (input.items.length === 0) missing.push("Specific item selections");
  if (input.uploads.length === 0) missing.push("Supporting files / artwork");
  return missing;
}

function computeNextStep(input: SummaryInput, missingCount: number, scope: string): string {
  if (missingCount > 2) return "Request missing information before quoting.";
  if (input.customFabricationRequested || input.immersiveRequested) {
    return "Schedule scope call to discuss fabrication / immersive requirements.";
  }
  if (scope === "High") return "Assign senior project manager and begin scoping call.";
  return "Begin quote preparation.";
}

export async function generateAiSummary(
  requestData: SummaryInput,
  ctx?: { requestId?: number; partnerId?: number },
): Promise<string> {
  // -------- Deterministic sections (zero AI cost) --------
  const scope = estimateScopeLevel(
    requestData.items.map((i) => ({ category: i.category })),
    {
      designAssistanceRequested: requestData.designAssistanceRequested,
      customFabricationRequested: requestData.customFabricationRequested,
      immersiveRequested: requestData.immersiveRequested,
      promotionalItemsRequested: requestData.promotionalItemsRequested,
    },
  );
  const timeline = computeTimeline(requestData.eventDate);
  const missing = computeMissing(requestData);
  const nextStep = computeNextStep(requestData, missing.length, scope);

  // -------- AI-only fields: overview prose + risk flags --------
  // Compact structured input — much smaller than the prior natural-language
  // template (which embedded labels, "Yes/No" strings, full item names, etc).
  // Categories deduped + capped at 8 to bound token count on big requests.
  const compact = {
    company: requestData.companyName,
    event: requestData.eventName,
    date: requestData.eventDate,
    venue: requestData.venueName || requestData.venueAddress || null,
    flags: {
      design: requestData.designAssistanceRequested,
      fabrication: requestData.customFabricationRequested,
      immersive: requestData.immersiveRequested,
      promo: requestData.promotionalItemsRequested,
    },
    itemCount: requestData.items.length,
    categories: Array.from(new Set(requestData.items.map((i) => i.category))).slice(0, 8),
    uploads: requestData.uploads.length,
    notes: (requestData.additionalNotes || "").slice(0, 400),
    scope,
    missing,
  };

  let overview = `${requestData.companyName} — ${requestData.eventName}.`;
  let risks: string[] = [];
  let tokensIn = 0;
  let tokensOut = 0;
  let aiOk = false;

  try {
    const client = getOpenAIClient();
    const response = await client.chat.completions.create({
      model: MODEL,
      temperature: 0.2,
      max_tokens: AI_MAX_OUTPUT_TOKENS,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            'A3 Visual project intake. Return JSON {"overview":"<2-3 sentences plain prose>","risks":["<short flag>",...]}. ' +
            "Risks: ≤4 short flags, omit array if none. " +
            "Treat the supplied scope, missing[] and flags as already-known facts — do not restate them. " +
            "No prose outside JSON. No bullet markers in fields.",
        },
        { role: "user", content: JSON.stringify(compact) },
      ],
    });
    const content = response.choices[0]?.message?.content;
    if (content) {
      const parsed = JSON.parse(content);
      if (typeof parsed.overview === "string" && parsed.overview.trim()) {
        overview = parsed.overview.trim();
      }
      if (Array.isArray(parsed.risks)) {
        risks = parsed.risks.filter((r: any) => typeof r === "string" && r.trim()).slice(0, 4);
      }
    }
    tokensIn = response.usage?.prompt_tokens || 0;
    tokensOut = response.usage?.completion_tokens || 0;
    aiOk = true;
  } catch (err) {
    logger.error({ err, requestId: ctx?.requestId }, "Failed to generate AI summary");
  }

  // Observability — emit alongside deck.parse.*, package_pdf.parse.*, etc.
  // so request-summary AI cost shows up in the same usage_events view.
  // Fire-and-forget; do not block response on the insert.
  if (ctx) {
    usageEmit(aiOk ? "request.ai_summary.generated" : "request.ai_summary.failed", {
      partnerId: ctx.partnerId ?? null,
      objectType: "request",
      objectId: ctx.requestId ?? null,
      meta: { tokensIn, tokensOut, model: MODEL, risks: risks.length, scope },
    }).catch(() => { /* tracking is best-effort */ });
  }

  // -------- Compose the final multi-section text --------
  // Same 1-6 numbered sections RequestDetail.tsx already renders; only the
  // SOURCE of each section changed (most are now deterministic). Sections
  // 4 and 5 always emit headers — placeholders are used when empty so the
  // layout never collapses.
  const lines: string[] = [];
  lines.push("1. Project Overview");
  lines.push(overview);
  lines.push("");
  lines.push(`2. Complexity Estimate: ${scope}`);
  lines.push("");
  lines.push(`3. Timeline: ${timeline}`);
  lines.push("");
  lines.push("4. Risk Flags");
  if (risks.length > 0) {
    for (const r of risks) lines.push(`- ${r}`);
  } else {
    lines.push("- None noted.");
  }
  lines.push("");
  lines.push(`5. Missing Details: ${missing.length > 0 ? missing.join(", ") : "None — all key information provided."}`);
  lines.push("");
  lines.push(`6. Recommended Next Step: ${nextStep}`);
  return lines.join("\n");
}

export function generateInternalSummary(requestData: {
  companyName: string;
  contactName: string;
  email: string;
  phone: string | null;
  eventName: string;
  eventDate: string | null;
  venueName: string | null;
  venueAddress: string | null;
  installDatetime: string | null;
  removalDatetime: string | null;
  postEventDisposition: string | null;
  items: { category: string; itemName: string; quantityNote: string | null; sizeNote: string | null }[];
  uploads: { uploadType: string; fileName: string }[];
  designAssistanceRequested: boolean;
  customFabricationRequested: boolean;
  immersiveRequested: boolean;
  promotionalItemsRequested: boolean;
  additionalNotes: string | null;
}): string {
  const lines: string[] = [];

  lines.push("=== CONTACT SUMMARY ===");
  lines.push(`Company: ${requestData.companyName}`);
  lines.push(`Contact: ${requestData.contactName}`);
  lines.push(`Email: ${requestData.email}`);
  if (requestData.phone) lines.push(`Phone: ${requestData.phone}`);

  lines.push("\n=== EVENT SUMMARY ===");
  lines.push(`Event: ${requestData.eventName}`);
  lines.push(`Date: ${requestData.eventDate || "TBD"}`);
  if (requestData.venueName) lines.push(`Venue: ${requestData.venueName}`);
  if (requestData.venueAddress) lines.push(`Address: ${requestData.venueAddress}`);
  if (requestData.installDatetime) lines.push(`Install: ${requestData.installDatetime}`);
  if (requestData.removalDatetime) lines.push(`Removal: ${requestData.removalDatetime}`);
  if (requestData.postEventDisposition) lines.push(`Post-Event: ${requestData.postEventDisposition}`);

  lines.push("\n=== REQUESTED ITEMS ===");
  if (requestData.items.length === 0) {
    lines.push("No specific items selected.");
  } else {
    const grouped: Record<string, string[]> = {};
    for (const item of requestData.items) {
      if (!grouped[item.category]) grouped[item.category] = [];
      let desc = item.itemName;
      if (item.quantityNote) desc += ` (Qty: ${item.quantityNote})`;
      if (item.sizeNote) desc += ` (Size: ${item.sizeNote})`;
      grouped[item.category].push(desc);
    }
    for (const [cat, items] of Object.entries(grouped)) {
      lines.push(`${cat}:`);
      items.forEach((i) => lines.push(`  - ${i}`));
    }
  }

  lines.push("\n=== UPLOADS RECEIVED ===");
  if (requestData.uploads.length === 0) {
    lines.push("No files uploaded.");
  } else {
    const groupedUploads: Record<string, string[]> = {};
    for (const u of requestData.uploads) {
      if (!groupedUploads[u.uploadType]) groupedUploads[u.uploadType] = [];
      groupedUploads[u.uploadType].push(u.fileName);
    }
    for (const [type, files] of Object.entries(groupedUploads)) {
      lines.push(`${type}: ${files.join(", ")}`);
    }
  }

  lines.push("\n=== SPECIAL NEEDS ===");
  if (requestData.designAssistanceRequested) lines.push("Design Assistance: Requested");
  if (requestData.customFabricationRequested) lines.push("Custom Fabrication: Requested");
  if (requestData.immersiveRequested) lines.push("Immersive Experiences: Requested");
  if (requestData.promotionalItemsRequested) lines.push("Promotional Items: Requested");

  lines.push("\n=== MISSING INFORMATION ===");
  const missing: string[] = [];
  if (!requestData.eventDate) missing.push("Event date");
  if (!requestData.venueName && !requestData.venueAddress) missing.push("Venue details");
  if (!requestData.installDatetime) missing.push("Install date/time");
  if (!requestData.removalDatetime) missing.push("Removal date/time");
  if (requestData.items.length === 0) missing.push("Specific item selections");
  if (requestData.uploads.length === 0) missing.push("Supporting files/artwork");
  lines.push(missing.length > 0 ? missing.join(", ") : "None - all key information provided.");

  lines.push("\n=== SUGGESTED NEXT ACTION ===");
  if (missing.length > 2) {
    lines.push("Request missing information before quoting.");
  } else if (requestData.customFabricationRequested || requestData.immersiveRequested) {
    lines.push("Schedule scope call to discuss fabrication/immersive requirements.");
  } else {
    lines.push("Begin quote preparation.");
  }

  if (requestData.additionalNotes) {
    lines.push(`\n=== ADDITIONAL NOTES ===\n${requestData.additionalNotes}`);
  }

  return lines.join("\n");
}

export function estimateScopeLevel(items: { category: string }[], flags: {
  designAssistanceRequested: boolean;
  customFabricationRequested: boolean;
  immersiveRequested: boolean;
  promotionalItemsRequested: boolean;
}): string {
  let score = items.length;
  if (flags.customFabricationRequested) score += 5;
  if (flags.immersiveRequested) score += 5;
  if (flags.designAssistanceRequested) score += 2;
  if (flags.promotionalItemsRequested) score += 2;

  const uniqueCategories = new Set(items.map((i) => i.category)).size;
  score += uniqueCategories * 2;

  if (score <= 5) return "Small";
  if (score <= 12) return "Medium";
  return "High";
}
