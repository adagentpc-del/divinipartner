import { db, partnersTable, pricingRulesTable } from "@workspace/db";

async function seed() {
  console.log("Seeding pricing rules...");

  const pricingRules = [
    { category: "Printing", itemName: "Step and repeat", startingPrice: 350, upsellTagsJson: ["Stanchions", "Lighting", "Branded carpet", "Photo signage"] },
    { category: "Printing", itemName: "Pull up banner", startingPrice: 175, upsellTagsJson: ["Registration signage", "Foam boards"] },
    { category: "Printing", itemName: "Vinyl graphics", startingPrice: 200, upsellTagsJson: ["Window graphics", "Decals"] },
    { category: "Printing", itemName: "Foam board signage", startingPrice: 85, upsellTagsJson: ["Easels", "Pull up banner"] },
    { category: "Printing", itemName: "Event signage", startingPrice: 150, upsellTagsJson: ["Decals", "Collateral"] },
    { category: "Printing", itemName: "Wayfinding", startingPrice: 125 },
    { category: "Printing", itemName: "Window graphics", startingPrice: 250 },
    { category: "Printing", itemName: "Table throws", startingPrice: 150 },
    { category: "Printing", itemName: "Backdrops", startingPrice: 450, upsellTagsJson: ["Lighting", "Step and repeat"] },
    { category: "Printing", itemName: "Decals", startingPrice: 75 },
    { category: "Printing", itemName: "Large format prints", startingPrice: 300 },
    { category: "Rentals", itemName: "Easy up tent", startingPrice: 250, upsellTagsJson: ["Table throws", "Feather flags", "Branded walls"] },
    { category: "Rentals", itemName: "Easels", startingPrice: 35 },
    { category: "Rentals", itemName: "Stanchions", startingPrice: 45 },
    { category: "Rentals", itemName: "Pipe and drape", startingPrice: 200, upsellTagsJson: ["Backdrops", "Lighting"] },
    { category: "Rentals", itemName: "Display structures", startingPrice: 350 },
    { category: "Rentals", itemName: "Screens", startingPrice: 400 },
    { category: "Rentals", itemName: "LED furniture", startingPrice: 300, upsellTagsJson: ["LED visual support", "Branded experience"] },
    { category: "Rentals", itemName: "Event barriers", startingPrice: 75 },
    { category: "Design and artwork", itemName: "I have final artwork", startingPrice: 0 },
    { category: "Design and artwork", itemName: "I need edits to existing artwork", startingPrice: 150 },
    { category: "Design and artwork", itemName: "I need full design support", startingPrice: 500 },
    { category: "Custom fabrication", itemName: "Custom fabrication needed", startingPrice: null, upsellTagsJson: ["Concept development", "Premium install"] },
    { category: "Custom fabrication", itemName: "Concept development needed", startingPrice: null, upsellTagsJson: ["Custom fabrication needed", "Premium install"] },
    { category: "Immersive experiences", itemName: "Projection mapping", startingPrice: null, upsellTagsJson: ["Scenic fabrication", "Video loops"] },
    { category: "Immersive experiences", itemName: "Scenic environment", startingPrice: null, upsellTagsJson: ["Projection mapping", "Branded experience"] },
    { category: "Immersive experiences", itemName: "Branded experience", startingPrice: null, upsellTagsJson: ["Interactive activation", "LED visual support"] },
    { category: "Immersive experiences", itemName: "Interactive activation", startingPrice: null },
    { category: "Immersive experiences", itemName: "LED visual support", startingPrice: null },
    { category: "Promotional items", itemName: "Branded giveaways", startingPrice: 250, upsellTagsJson: ["Packaging", "Display items"] },
    { category: "Promotional items", itemName: "Apparel", startingPrice: 200, upsellTagsJson: ["Packaging", "Branded giveaways"] },
    { category: "Promotional items", itemName: "Packaging", startingPrice: 150 },
    { category: "Promotional items", itemName: "Printed collateral", startingPrice: 100 },
    { category: "Promotional items", itemName: "Custom promo item request", startingPrice: null },
  ];

  await db.insert(pricingRulesTable).values(pricingRules).onConflictDoNothing();
  console.log(`Seeded ${pricingRules.length} pricing rules`);

  console.log("Seeding sample partners...");

  const partners = [
    {
      companyName: "Move Miami",
      slug: "move-miami",
      introHeadline: "Welcome to the Move Miami Partner Portal",
      introText: "Submit your event and project needs through this portal. Our team at A3 Visual will review your request and follow up with a custom solution tailored to your needs.",
      contactName: "Move Miami Events",
      contactEmail: "events@movemiami.com",
      industryFocus: "Entertainment & Nightlife",
      useCaseOptionsJson: ["Event Signage", "Step and Repeat", "Branded Experience", "Promotional Items"],
      globalSizzleReelUrl: "https://www.youtube.com/embed/dQw4w9WgXcQ",
      pricingDisplayEnabled: true,
      isActive: true,
      smallA3BadgeEnabled: true,
    },
    {
      companyName: "Hilton",
      slug: "hilton",
      introHeadline: "Hilton Events Partnership Portal",
      introText: "Welcome to the Hilton x A3 Visual partnership portal. Use this form to submit your event production needs for any Hilton property. Our dedicated team will prepare a tailored proposal for your upcoming events.",
      contactName: "Hilton Events Team",
      contactEmail: "events@hilton.com",
      industryFocus: "Hospitality",
      useCaseOptionsJson: ["Conference Signage", "Wayfinding", "Branded Environment", "Custom Fabrication"],
      globalSizzleReelUrl: "https://www.youtube.com/embed/dQw4w9WgXcQ",
      pricingDisplayEnabled: true,
      isActive: true,
      smallA3BadgeEnabled: true,
    },
  ];

  await db.insert(partnersTable).values(partners).onConflictDoNothing();
  console.log(`Seeded ${partners.length} sample partners`);

  console.log("Seed complete!");
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
