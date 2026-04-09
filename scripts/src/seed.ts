import { eq } from "drizzle-orm";
import { db, partnersTable, pricingRulesTable, productCatalogTable, partnerSectionsTable, partnerThemesTable } from "@workspace/db";

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

  console.log("Seeding product catalog...");

  const products = [
    { name: "Step and Repeat", slug: "step-and-repeat", category: "Displays & Backdrops", description: "Professional step and repeat banners for red carpet events and photo opportunities", sizeOptionsJson: ["6x8 ft", "8x8 ft", "8x10 ft", "10x10 ft", "Custom"] },
    { name: "Retractable Banner", slug: "retractable-banner", category: "Displays & Backdrops", description: "Premium pull-up retractable banners for conferences and trade shows", sizeOptionsJson: ["33x80 in", "36x92 in", "47x80 in"] },
    { name: "Backdrop", slug: "backdrop", category: "Displays & Backdrops", description: "Large format backdrops for stages, events, and branded environments", sizeOptionsJson: ["8x8 ft", "8x10 ft", "10x12 ft", "Custom"] },
    { name: "Banner", slug: "banner", category: "Displays & Backdrops", description: "Vinyl and fabric banners for indoor and outdoor events", sizeOptionsJson: ["3x6 ft", "4x8 ft", "3x10 ft", "Custom"] },
    { name: "A-Frame Sign", slug: "a-frame", category: "Signage", description: "Double-sided A-frame sidewalk signs for wayfinding and branding", sizeOptionsJson: ["24x36 in", "27x46 in"] },
    { name: "Light Box", slug: "light-box", category: "Signage", description: "Illuminated light box displays for premium brand presence", sizeOptionsJson: ["24x36 in", "36x48 in", "Custom"] },
    { name: "Wall Vinyl", slug: "wall-vinyl", category: "Graphics", description: "Premium wall vinyl graphics for branded environments", sizeOptionsJson: ["Custom"] },
    { name: "Window Graphics", slug: "window-graphics", category: "Graphics", description: "Window cling and vinyl graphics for storefronts and venues", sizeOptionsJson: ["Custom"] },
    { name: "Floor Graphics", slug: "floor-graphics", category: "Graphics", description: "Anti-slip floor graphics for wayfinding and branding", sizeOptionsJson: ["Custom"] },
    { name: "Foam Board Signs", slug: "foam-board", category: "Signage", description: "Lightweight foam board signage for events and displays", sizeOptionsJson: ["18x24 in", "24x36 in", "30x40 in", "Custom"] },
    { name: "PVC Signs", slug: "pvc-signs", category: "Signage", description: "Durable PVC board signage for indoor and outdoor use", sizeOptionsJson: ["18x24 in", "24x36 in", "Custom"] },
    { name: "Acrylic Signs", slug: "acrylic-signs", category: "Signage", description: "Premium clear or frosted acrylic signage", sizeOptionsJson: ["12x18 in", "18x24 in", "24x36 in", "Custom"] },
    { name: "Flyers", slug: "flyers", category: "Printed Collateral", description: "Premium printed flyers and handouts", sizeOptionsJson: ["4x6 in", "5x7 in", "8.5x11 in"] },
    { name: "Business Cards", slug: "business-cards", category: "Printed Collateral", description: "Premium business cards with custom finishes", sizeOptionsJson: ["3.5x2 in"] },
    { name: "Programs", slug: "programs", category: "Printed Collateral", description: "Event programs and multi-page booklets", sizeOptionsJson: ["5.5x8.5 in", "8.5x11 in"] },
    { name: "Menus", slug: "menus", category: "Printed Collateral", description: "Custom printed menus for events and dining experiences", sizeOptionsJson: ["4x9 in", "8.5x11 in", "Custom"] },
    { name: "Badges & Lanyards", slug: "badges-lanyards", category: "Event Essentials", description: "Custom name badges, credential holders, and branded lanyards", sizeOptionsJson: ["Standard badge", "VIP badge", "Custom"] },
    { name: "Table Signage", slug: "table-signage", category: "Event Essentials", description: "Table tents, place cards, and table number displays", sizeOptionsJson: ["4x6 in tent", "5x7 in tent", "Custom"] },
    { name: "Sponsor Boards", slug: "sponsor-boards", category: "Displays & Backdrops", description: "Multi-sponsor recognition boards and displays", sizeOptionsJson: ["24x36 in", "36x48 in", "48x72 in", "Custom"] },
    { name: "Auction Paddles", slug: "auction-paddles", category: "Event Essentials", description: "Custom branded auction bid paddles", sizeOptionsJson: ["Standard"] },
    { name: "Awards & Trophies", slug: "awards", category: "Event Essentials", description: "Custom acrylic and engraved awards and trophies", sizeOptionsJson: ["Small", "Medium", "Large", "Custom"] },
    { name: "Invitations", slug: "invitations", category: "Printed Collateral", description: "Premium printed event invitations", sizeOptionsJson: ["5x7 in", "6x9 in", "Custom"] },
  ];

  await db.insert(productCatalogTable).values(products).onConflictDoNothing();
  console.log(`Seeded ${products.length} products`);

  console.log("Seeding sample partners...");

  const partners = [
    {
      companyName: "Move Miami",
      slug: "move-miami",
      introHeadline: "Welcome to the Move Miami Partner Portal",
      introText: "Submit your event and project needs through this portal. Our team at A3 Visual will review your request and follow up with a custom solution tailored to your needs.",
      contactName: "Move Miami Events",
      contactEmail: "events@movemiami.com",
      routingEmail: "events@movemiami.com",
      industryFocus: "Entertainment & Nightlife",
      useCaseOptionsJson: ["Event Signage", "Step and Repeat", "Branded Experience", "Promotional Items"],
      globalSizzleReelUrl: "https://www.youtube.com/embed/dQw4w9WgXcQ",
      pricingDisplayEnabled: true,
      portalMode: "full",
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
      routingEmail: "events@hilton.com",
      industryFocus: "Hospitality",
      useCaseOptionsJson: ["Conference Signage", "Wayfinding", "Branded Environment", "Custom Fabrication"],
      globalSizzleReelUrl: "https://www.youtube.com/embed/dQw4w9WgXcQ",
      pricingDisplayEnabled: true,
      portalMode: "full",
      isActive: true,
      smallA3BadgeEnabled: true,
    },
  ];

  for (const partner of partners) {
    const existing = await db.select().from(partnersTable).where(
      eq(partnersTable.slug, partner.slug)
    );
    if (existing.length > 0) {
      await db.update(partnersTable).set(partner).where(
        eq(partnersTable.slug, partner.slug)
      );
      console.log(`Updated partner: ${partner.companyName}`);
    } else {
      await db.insert(partnersTable).values(partner);
      console.log(`Created partner: ${partner.companyName}`);
    }
  }

  console.log("Seeding partner sections for Move Miami...");
  const [moveMiami] = await db.select().from(partnersTable).where(
    eq(partnersTable.slug, "move-miami")
  );

  if (moveMiami) {
    const sectionTypes = [
      { sectionType: "standard_products", title: "Event Products", subtitle: "Standard event signage and displays", description: "Browse our catalog of professional event products. Select, configure, and request a quote.", sortOrder: 1 },
      { sectionType: "venue_branding", title: "Brand This Venue", subtitle: "Pre-approved branding locations", description: "Choose from pre-mapped venue branding opportunities. A3 handles all production and installation specs.", sortOrder: 2 },
      { sectionType: "event_materials", title: "Event Materials", subtitle: "Branded collateral and print pieces", description: "Awards, programs, invitations, menus, badges, and more for your event.", sortOrder: 3 },
      { sectionType: "immersive", title: "Immersive Upgrades", subtitle: "Premium event enhancements", description: "LED walls, projection mapping, interactive displays, and branded scenic elements.", sortOrder: 4 },
      { sectionType: "fabrication", title: "Custom Fabrication", subtitle: "Bespoke builds and structures", description: "Custom-built event pieces, scenic elements, and unique installations.", sortOrder: 5 },
      { sectionType: "open_request", title: "Creative Request", subtitle: "Something else in mind?", description: "Have a unique idea? Tell us about it and we'll make it happen.", sortOrder: 6 },
    ];

    const existingSections = await db.select().from(partnerSectionsTable).where(
      eq(partnerSectionsTable.partnerId, moveMiami.id)
    );

    if (existingSections.length === 0) {
      await db.insert(partnerSectionsTable).values(
        sectionTypes.map(s => ({ ...s, partnerId: moveMiami.id, isEnabled: true }))
      );
      console.log(`Seeded ${sectionTypes.length} sections for Move Miami`);
    }

    const existingTheme = await db.select().from(partnerThemesTable).where(
      eq(partnerThemesTable.partnerId, moveMiami.id)
    );

    if (existingTheme.length === 0) {
      await db.insert(partnerThemesTable).values({
        partnerId: moveMiami.id,
        primaryColor: "#0f1729",
        secondaryColor: "#1e293b",
        accentColor: "#f59e0b",
        backgroundColor: "#f8fafc",
        headingFont: "Inter",
        bodyFont: "Inter",
        buttonStyle: "rounded",
        borderRadius: "0.75rem",
        tonePreset: "luxury",
        isApproved: "approved",
      });
      console.log("Seeded theme for Move Miami");
    }
  }

  console.log("Seed complete!");
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
