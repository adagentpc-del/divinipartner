import { db, deckExtractionsTable, deckExtractionItemsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

interface ExtractedItem {
  locationName: string;
  category: string;
  description: string;
  dimensionsText: string | null;
  sizeWidth: number | null;
  sizeHeight: number | null;
  sizeUnit: string;
  sourcePageNumber: number;
  extractedTextSnippet: string;
  confidenceScore: number;
}

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  "Wall Graphic": ["wall", "mural", "wallscape", "wall wrap"],
  "Window Decal": ["window", "glass", "glazing"],
  "Column Wrap": ["column", "pillar", "post"],
  "Pole Banner": ["pole", "banner pole", "light pole", "street pole"],
  "Fence Banner": ["fence", "barricade", "barrier"],
  "Floor Graphic": ["floor", "ground", "walkway", "carpet"],
  "Door Graphic": ["door", "entrance", "exit", "elevator"],
  "Directional Signage": ["directional", "wayfinding", "arrow", "directory"],
  "Registration Branding": ["registration", "check-in", "lobby", "reception"],
  "Step and Repeat Zone": ["step and repeat", "step & repeat", "photo backdrop", "press wall"],
  "Sponsor Zone": ["sponsor", "logo wall", "sponsorship"],
};

function guessCategory(text: string): string {
  const lower = text.toLowerCase();
  for (const [cat, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some(kw => lower.includes(kw))) return cat;
  }
  return "Custom / Other";
}

function parseDimensions(text: string): { width: number | null; height: number | null; unit: string; raw: string | null } {
  const patterns = [
    /(\d+(?:\.\d+)?)\s*['"x×]\s*(\d+(?:\.\d+)?)\s*(feet|ft|inches|in|"|'|cm|m|meters)?/i,
    /(\d+(?:\.\d+)?)\s*(?:ft|feet|')\s*[x×]\s*(\d+(?:\.\d+)?)\s*(?:ft|feet|')/i,
    /(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const w = parseFloat(match[1]);
      const h = parseFloat(match[2]);
      let unit = "inches";
      const rawUnit = (match[3] || "").toLowerCase();
      if (rawUnit.includes("ft") || rawUnit.includes("feet") || rawUnit === "'") unit = "feet";
      else if (rawUnit.includes("cm")) unit = "cm";
      else if (rawUnit.includes("m")) unit = "meters";
      return { width: w, height: h, unit, raw: match[0] };
    }
  }
  return { width: null, height: null, unit: "inches", raw: null };
}

async function extractWithOpenAI(textPages: { page: number; text: string }[]): Promise<ExtractedItem[]> {
  const baseUrl = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
  const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;

  if (!baseUrl || !apiKey) {
    return extractWithRules(textPages);
  }

  const combinedText = textPages.map(p => `--- Page ${p.page} ---\n${p.text}`).join("\n\n");
  const truncated = combinedText.substring(0, 12000);

  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.1,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: `You extract venue branding location data from site survey deck text. Return JSON with a "locations" array. Each location should have: locationName (string), category (one of: Wall Graphic, Window Decal, Column Wrap, Pole Banner, Fence Banner, Floor Graphic, Door Graphic, Directional Signage, Registration Branding, Step and Repeat Zone, Sponsor Zone, Custom / Other), description (string), dimensionsText (string or null, raw text about dimensions), sizeWidth (number or null), sizeHeight (number or null), sizeUnit (string: inches/feet/cm/meters), sourcePageNumber (number), extractedTextSnippet (the relevant text from the page), confidenceScore (0.0-1.0). Be thorough - extract every possible branding location mentioned.`
          },
          {
            role: "user",
            content: `Extract all venue branding locations from this site survey deck:\n\n${truncated}`
          }
        ]
      })
    });

    if (!res.ok) {
      console.error("OpenAI extraction failed, falling back to rules", await res.text());
      return extractWithRules(textPages);
    }

    const data = await res.json() as any;
    const content = data.choices?.[0]?.message?.content;
    if (!content) return extractWithRules(textPages);

    const parsed = JSON.parse(content);
    const locations = parsed.locations || [];
    return locations.map((loc: any) => ({
      locationName: loc.locationName || "Unknown Location",
      category: loc.category || "Custom / Other",
      description: loc.description || "",
      dimensionsText: loc.dimensionsText || null,
      sizeWidth: loc.sizeWidth || null,
      sizeHeight: loc.sizeHeight || null,
      sizeUnit: loc.sizeUnit || "inches",
      sourcePageNumber: loc.sourcePageNumber || 1,
      extractedTextSnippet: loc.extractedTextSnippet || "",
      confidenceScore: Math.min(1, Math.max(0, loc.confidenceScore || 0.5)),
    }));
  } catch (err) {
    console.error("OpenAI extraction error:", err);
    return extractWithRules(textPages);
  }
}

function extractWithRules(textPages: { page: number; text: string }[]): ExtractedItem[] {
  const items: ExtractedItem[] = [];

  for (const { page, text } of textPages) {
    if (!text || text.trim().length < 20) continue;

    const lines = text.split(/\n/).filter(l => l.trim().length > 3);
    const dims = parseDimensions(text);
    const category = guessCategory(text);
    const snippet = text.substring(0, 300).trim();

    const titleLine = lines.find(l => l.trim().length > 3 && l.trim().length < 80) || `Page ${page} Location`;

    items.push({
      locationName: titleLine.trim().replace(/^[•\-\*\d\.]+\s*/, ""),
      category,
      description: "",
      dimensionsText: dims.raw,
      sizeWidth: dims.width,
      sizeHeight: dims.height,
      sizeUnit: dims.unit,
      sourcePageNumber: page,
      extractedTextSnippet: snippet,
      confidenceScore: category !== "Custom / Other" ? 0.4 : 0.2,
    });
  }

  return items;
}

export async function processDeckExtraction(extractionId: number, partnerId: number, fileBuffer: Buffer, fileName: string): Promise<void> {
  try {
    let pdfParse: any;
    try {
      pdfParse = (await import("pdf-parse")).default;
    } catch {
      await db.update(deckExtractionsTable)
        .set({ status: "failed", errorMessage: "PDF parsing library not available" })
        .where(eq(deckExtractionsTable.id, extractionId));
      return;
    }

    const pdfData = await pdfParse(fileBuffer);
    const totalPages = pdfData.numpages || 1;

    await db.update(deckExtractionsTable)
      .set({ totalPages })
      .where(eq(deckExtractionsTable.id, extractionId));

    const pageTexts: { page: number; text: string }[] = [];
    const rawText = pdfData.text || "";
    const pageChunks = rawText.split(/\f/);

    for (let i = 0; i < Math.max(pageChunks.length, totalPages); i++) {
      pageTexts.push({
        page: i + 1,
        text: pageChunks[i] || "",
      });
    }

    const extractedItems = await extractWithOpenAI(pageTexts);

    if (extractedItems.length === 0) {
      for (let i = 0; i < totalPages; i++) {
        extractedItems.push({
          locationName: `Page ${i + 1} - Review Required`,
          category: "Custom / Other",
          description: "No specific branding location detected on this page. Manual review required.",
          dimensionsText: null,
          sizeWidth: null,
          sizeHeight: null,
          sizeUnit: "inches",
          sourcePageNumber: i + 1,
          extractedTextSnippet: (pageTexts[i]?.text || "").substring(0, 200),
          confidenceScore: 0.1,
        });
      }
    }

    for (const item of extractedItems) {
      await db.insert(deckExtractionItemsTable).values({
        extractionId,
        partnerId,
        locationName: item.locationName,
        category: item.category,
        description: item.description,
        dimensionsText: item.dimensionsText,
        sizeWidth: item.sizeWidth,
        sizeHeight: item.sizeHeight,
        sizeUnit: item.sizeUnit,
        sourcePageNumber: item.sourcePageNumber,
        extractedTextSnippet: item.extractedTextSnippet,
        confidenceScore: item.confidenceScore,
        reviewStatus: "pending",
      });
    }

    await db.update(deckExtractionsTable)
      .set({ status: "completed", processedAt: new Date() })
      .where(eq(deckExtractionsTable.id, extractionId));

  } catch (err: any) {
    console.error("Deck extraction failed:", err);
    await db.update(deckExtractionsTable)
      .set({ status: "failed", errorMessage: err.message || "Unknown error" })
      .where(eq(deckExtractionsTable.id, extractionId));
  }
}
