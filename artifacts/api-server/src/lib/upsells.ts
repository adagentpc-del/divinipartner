const UPSELL_RULES: Record<string, string[]> = {
  "Step and repeat": ["Stanchions", "Lighting", "Branded carpet", "Photo signage"],
  "Easy up tent": ["Table throws", "Feather flags", "Branded walls"],
  "Pull up banner": ["Registration signage", "Foam boards"],
  "Event signage": ["Decals", "Collateral"],
  "Projection mapping": ["Scenic fabrication", "Video loops"],
  "Custom fabrication needed": ["Concept development", "Premium install"],
  "Concept development needed": ["Custom fabrication needed", "Premium install"],
  "Branded giveaways": ["Packaging", "Display items"],
  "Apparel": ["Packaging", "Branded giveaways"],
  "Vinyl graphics": ["Window graphics", "Decals"],
  "Foam board signage": ["Easels", "Pull up banner"],
  "Backdrops": ["Lighting", "Step and repeat"],
  "Pipe and drape": ["Backdrops", "Lighting"],
  "LED furniture": ["LED visual support", "Branded experience"],
  "Scenic environment": ["Projection mapping", "Branded experience"],
  "Branded experience": ["Interactive activation", "LED visual support"],
};

export function generateRecommendedUpsells(items: { itemName: string }[]): string[] {
  const selectedNames = new Set(items.map((i) => i.itemName));
  const upsells = new Set<string>();

  for (const item of items) {
    const recs = UPSELL_RULES[item.itemName];
    if (recs) {
      for (const rec of recs) {
        if (!selectedNames.has(rec)) {
          upsells.add(rec);
        }
      }
    }
  }

  return Array.from(upsells);
}
