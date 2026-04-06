import OpenAI from "openai";
import { logger } from "./logger";

function getOpenAIClient() {
  return new OpenAI({
    baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
    apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  });
}

export async function generateAiSummary(requestData: {
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
}): Promise<string> {
  try {
    const client = getOpenAIClient();
    const itemsList = requestData.items.map((i) => `- ${i.category}: ${i.itemName}`).join("\n");
    const uploadsList = requestData.uploads.map((u) => `- ${u.uploadType}: ${u.fileName}`).join("\n");

    const prompt = `You are an internal project coordinator at A3 Visual, a premium event production company. Analyze this project request and provide a concise internal summary.

Request Details:
- Company: ${requestData.companyName}
- Contact: ${requestData.contactName}
- Event: ${requestData.eventName}
- Event Date: ${requestData.eventDate || "TBD"}
- Venue: ${requestData.venueName || "TBD"} at ${requestData.venueAddress || "TBD"}
- Design Assistance: ${requestData.designAssistanceRequested ? "Yes" : "No"}
- Custom Fabrication: ${requestData.customFabricationRequested ? "Yes" : "No"}
- Immersive Experiences: ${requestData.immersiveRequested ? "Yes" : "No"}
- Promotional Items: ${requestData.promotionalItemsRequested ? "Yes" : "No"}
- Additional Notes: ${requestData.additionalNotes || "None"}

Requested Items:
${itemsList || "None specified"}

Uploaded Files:
${uploadsList || "None"}

Provide a summary with these sections (use plain text, no markdown):
1. Project Overview (2-3 sentences)
2. Complexity Estimate (Small/Medium/High with brief reasoning)
3. Timeline Sensitivity (based on event date proximity)
4. Potential Risk Flags
5. Missing Details
6. Recommended Next Step`;

    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      max_completion_tokens: 1000,
    });

    return response.choices[0]?.message?.content || "Unable to generate summary.";
  } catch (err) {
    logger.error({ err }, "Failed to generate AI summary");
    return "AI summary generation failed. Please review the request manually.";
  }
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
