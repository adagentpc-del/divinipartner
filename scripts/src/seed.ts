import { eq, and } from "drizzle-orm";
import { db, partnersTable, pricingRulesTable, productCatalogTable, partnerSectionsTable, partnerThemesTable, suppliersTable, citiesTable, venuesTable, eventsTable, packagesTable, packageItemsTable, inventoryTable, userRolesTable, partnerEmailRecipientsTable, usageEvents, ordersTable } from "@workspace/db";

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
    // ----------------------------------------------------------------------
    // Measurement-aware pricing demo products (April 2026 extension).
    // Each demonstrates one supported pricing model so the partner ordering
    // portal can exercise fixed / area / linear / custom_quote flows.
    // ----------------------------------------------------------------------
    {
      name: "Pop-Up Banner 200cm", slug: "pop-up-banner-200cm",
      category: "Displays & Backdrops",
      description: "200 cm wide retractable pop-up banner — fixed price.",
      sizeWidth: 200, sizeHeight: 80, sizeUnit: "cm",
      pricingModel: "fixed", unitRate: "120.00", pricingUnit: "per_unit",
      allowsCustomSize: false, isActive: true,
    },
    {
      name: "Wall Wrap (per sqm)", slug: "wall-wrap-per-sqm",
      category: "Graphics",
      description: "Vinyl wall wrap priced per square metre. Min 1 sqm.",
      pricingModel: "area", unitRate: "45.00", pricingUnit: "per_sqm",
      minBillableSize: 1, allowsCustomSize: true, isActive: true,
    },
    {
      name: "Edge Trim (per linear m)", slug: "edge-trim-per-linear-m",
      category: "Signage",
      description: "Aluminium edge trim sold by the linear metre.",
      pricingModel: "linear", unitRate: "18.00", pricingUnit: "per_linear_m",
      minBillableSize: 1, allowsCustomSize: true, isActive: true,
    },
    {
      name: "Custom Stage Set (quote)", slug: "custom-stage-set-quote",
      category: "Custom Fabrication",
      description: "Bespoke stage set — sales will follow up with a custom quote.",
      pricingModel: "custom_quote", allowsCustomSize: true, isActive: true,
    },
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
      // Branded-sender demo wiring so the Email Readiness page shows a
      // partner that is fully configured for deliverability out of the box.
      // These fields drive the From line, Reply-To, internal forward, and
      // legacy CC fallbacks; the per-role recipients seeded later override
      // them when present.
      emailFromName: "Move Miami Events",
      emailSenderLabel: "Move Miami × A3 Visual",
      replyToEmail: "events@movemiami.example",
      internalForwardEmail: "ops@movemiami.example",
      ccEmail: "ops-cc@movemiami.example",
      billingContactEmail: "billing@movemiami.example",
      emailEnabled: true,
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

    // Section 22: extra demos so the named section picker / visibility states
    // are exercised end-to-end. `packages` and `catalog` are universal types
    // and `cities` ships hidden so the visible/hidden split is observable.
    const extraSectionTypes = [
      { sectionType: "hero",     title: "Brand With Move Miami", subtitle: "Premier Miami event partner",       description: "Hero banner intro for the partner portal.",     isEnabled: true,  sortOrder: 0 },
      { sectionType: "packages", title: "Activation Packages",    subtitle: "Choose the right tier",             description: "Bundled packages clients can pick from.",       isEnabled: true,  sortOrder: 7 },
      { sectionType: "catalog",  title: "Item Catalog",           subtitle: "À-la-carte add-ons",                 description: "Individual products available beyond packages.", isEnabled: true,  sortOrder: 8 },
      { sectionType: "cities",   title: "Pick Your City",         subtitle: "Multi-city ordering",                description: "Hidden by default — Move Miami is single-city.", isEnabled: false, sortOrder: 9 },
    ];

    const existingSections = await db.select().from(partnerSectionsTable).where(
      eq(partnerSectionsTable.partnerId, moveMiami.id)
    );

    if (existingSections.length === 0) {
      const all = [...sectionTypes, ...extraSectionTypes];
      await db.insert(partnerSectionsTable).values(
        all.map(s => ({ partnerId: moveMiami.id, isEnabled: true, ...s }))
      );
      console.log(`Seeded ${all.length} sections for Move Miami`);
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

  console.log("Seeding suppliers...");
  const suppliers = [
    { name: "A3 Visual", slug: "a3-visual", description: "Premium event production, signage, fabrication, immersive experiences", categoriesJson: ["Print", "Fabrication", "Immersive"], capabilitiesJson: ["Large format print", "Custom fabrication", "Install/teardown", "Projection mapping", "LED walls"], territoryJson: ["USA", "Canada"], contactName: "A3 Production", contactEmail: "production@a3visual.com", isActive: true },
    { name: "B2 Print Co", slug: "b2-print-co", description: "High-volume printing, vinyl graphics, banners, retractables", categoriesJson: ["Print"], capabilitiesJson: ["Vinyl banners", "Retractable banners", "Foam board", "Window graphics"], territoryJson: ["USA Southeast"], contactName: "B2 Sales", contactEmail: "sales@b2print.example", isActive: true },
    { name: "WS Fulfillment", slug: "ws-fulfillment", description: "Warehouse, shipping, hardware rentals, installation", categoriesJson: ["Logistics", "Rental"], capabilitiesJson: ["Hardware rental", "Warehousing", "Shipping", "Install"], territoryJson: ["USA"], contactName: "WS Ops", contactEmail: "ops@wsfulfillment.example", isActive: true },
  ];
  for (const s of suppliers) {
    const existing = await db.select().from(suppliersTable).where(eq(suppliersTable.slug, s.slug));
    if (existing.length === 0) await db.insert(suppliersTable).values(s);
  }
  console.log(`Seeded ${suppliers.length} suppliers`);

  const [a3Supplier] = await db.select().from(suppliersTable).where(eq(suppliersTable.slug, "a3-visual"));
  const [b2Supplier] = await db.select().from(suppliersTable).where(eq(suppliersTable.slug, "b2-print-co"));
  const [wsSupplier] = await db.select().from(suppliersTable).where(eq(suppliersTable.slug, "ws-fulfillment"));

  console.log("Seeding Social Commerce Festival partner...");
  const scfData = {
    companyName: "Social Commerce Festival",
    slug: "social-commerce-festival",
    introHeadline: "Order your Festival materials",
    introText: "Select your city, choose a package, configure add-ons, upload artwork, and submit. Our partner network handles production and on-site setup.",
    contactName: "SCF Operations",
    contactEmail: "ops@socialcommercefest.example",
    routingEmail: "ops@socialcommercefest.example",
    industryFocus: "Festivals & Conferences",
    portalMode: "ordering",
    partnerType: "ordering",
    pricingMode: "wholesale",
    defaultSupplierId: a3Supplier?.id,
    pricingDisplayEnabled: true,
    isActive: true,
    smallA3BadgeEnabled: true,
  };
  const existingScf = await db.select().from(partnersTable).where(eq(partnersTable.slug, scfData.slug));
  if (existingScf.length === 0) await db.insert(partnersTable).values(scfData);
  else await db.update(partnersTable).set(scfData).where(eq(partnersTable.slug, scfData.slug));
  const [scf] = await db.select().from(partnersTable).where(eq(partnersTable.slug, "social-commerce-festival"));

  // Mark Move Miami / Hilton as branding type
  await db.update(partnersTable).set({ partnerType: "branding" }).where(eq(partnersTable.slug, "move-miami"));
  await db.update(partnersTable).set({ partnerType: "branding" }).where(eq(partnersTable.slug, "hilton"));

  console.log("Seeding cities + venues for Social Commerce Festival...");
  const cityNames = [
    { name: "Miami", state: "FL", venues: [
      { name: "Wynwood Walls Pavilion", venueAddress: "2520 NW 2nd Ave, Miami FL 33127", shippingAddress: "2520 NW 2nd Ave, Miami FL 33127", onsiteContactName: "Maria Reyes", onsiteContactPhone: "305-555-0101", onsiteContactEmail: "maria@wynwood.example", installNotes: "Loading dock at rear, freight elevator available 8am-6pm" },
      { name: "Brickell Convention Center", venueAddress: "1100 Brickell Ave, Miami FL 33131", shippingAddress: "1100 Brickell Ave, Miami FL 33131 (Receiving)", onsiteContactName: "Carlos Diaz", onsiteContactPhone: "305-555-0102", onsiteContactEmail: "carlos@brickell.example", installNotes: "Union venue. All install by venue staff." },
    ]},
    { name: "Austin", state: "TX", venues: [
      { name: "East Side Warehouse", venueAddress: "2500 E 6th St, Austin TX 78702", shippingAddress: "2500 E 6th St, Austin TX 78702", onsiteContactName: "Jamie Lin", onsiteContactPhone: "512-555-0201", onsiteContactEmail: "jamie@eastside.example", installNotes: "24-hour load-in window" },
      { name: "South Congress Atrium", venueAddress: "1801 S Congress Ave, Austin TX 78704", shippingAddress: "1801 S Congress Ave, Austin TX 78704", onsiteContactName: "Tyler Brooks", onsiteContactPhone: "512-555-0202", onsiteContactEmail: "tyler@southcongress.example" },
    ]},
    { name: "New York", state: "NY", venues: [
      { name: "Brooklyn Navy Yard Pavilion", venueAddress: "63 Flushing Ave, Brooklyn NY 11205", shippingAddress: "63 Flushing Ave, Brooklyn NY 11205", onsiteContactName: "Priya Shah", onsiteContactPhone: "718-555-0301", onsiteContactEmail: "priya@navyyard.example", installNotes: "Secure entry. Photo ID required." },
      { name: "SoHo Pop-Up Space", venueAddress: "115 Mercer St, New York NY 10012", shippingAddress: "115 Mercer St, New York NY 10012", onsiteContactName: "Alex Chen", onsiteContactPhone: "212-555-0302", onsiteContactEmail: "alex@soho.example" },
    ]},
  ];

  if (scf) {
    for (const c of cityNames) {
      const existing = await db.select().from(citiesTable).where(and(eq(citiesTable.partnerId, scf.id), eq(citiesTable.name, c.name)));
      let city;
      if (existing.length === 0) {
        [city] = await db.insert(citiesTable).values({ partnerId: scf.id, name: c.name, state: c.state, isActive: true }).returning();
      } else { city = existing[0]; }
      for (const v of c.venues) {
        const existingV = await db.select().from(venuesTable).where(and(eq(venuesTable.partnerId, scf.id), eq(venuesTable.name, v.name)));
        if (existingV.length === 0) await db.insert(venuesTable).values({ ...v, partnerId: scf.id, cityId: city.id, isActive: true });
      }
    }
  }
  console.log("Seeded cities and venues");

  console.log("Seeding packages for Social Commerce Festival...");
  const allProducts = await db.select().from(productCatalogTable);
  const findP = (slug: string) => allProducts.find(p => p.slug === slug);

  if (scf) {
    const packageDefs = [
      { name: "Essentials Package", displayName: "Tier 1 - Essentials", description: "Core branding presence: step and repeat, retractable banners, table signage, and badges.", tier: 1, price: "1850.00", supplierId: a3Supplier?.id, items: [
        { slug: "step-and-repeat", quantity: 1 }, { slug: "retractable-banner", quantity: 2 }, { slug: "table-signage", quantity: 4 }, { slug: "badges-lanyards", quantity: 50 },
      ]},
      { name: "Premium Package", displayName: "Tier 2 - Premium", description: "Full event presence: backdrops, sponsor boards, custom signage, foam boards, and complete collateral.", tier: 2, price: "4200.00", supplierId: a3Supplier?.id, items: [
        { slug: "backdrop", quantity: 2 }, { slug: "sponsor-boards", quantity: 1 }, { slug: "retractable-banner", quantity: 4 }, { slug: "foam-board", quantity: 6 }, { slug: "table-signage", quantity: 8 }, { slug: "badges-lanyards", quantity: 100 }, { slug: "programs", quantity: 100 },
      ]},
      { name: "Flagship Package", displayName: "Tier 3 - Flagship", description: "Maximum brand impact: large-format backdrops, light boxes, wall vinyls, awards, and full event collateral suite.", tier: 3, price: "9500.00", supplierId: a3Supplier?.id, items: [
        { slug: "backdrop", quantity: 3 }, { slug: "light-box", quantity: 4 }, { slug: "wall-vinyl", quantity: 2 }, { slug: "sponsor-boards", quantity: 2 }, { slug: "retractable-banner", quantity: 6 }, { slug: "awards", quantity: 10 }, { slug: "programs", quantity: 250 }, { slug: "badges-lanyards", quantity: 250 }, { slug: "table-signage", quantity: 12 },
      ]},
    ];
    for (const pdef of packageDefs) {
      const { items, ...pkg } = pdef;
      const existing = await db.select().from(packagesTable).where(and(eq(packagesTable.partnerId, scf.id), eq(packagesTable.name, pkg.name)));
      let pkgRow;
      if (existing.length === 0) {
        [pkgRow] = await db.insert(packagesTable).values({ ...pkg, partnerId: scf.id, isActive: true }).returning();
        const itemValues = items.map((it, idx) => {
          const product = findP(it.slug);
          return product ? { packageId: pkgRow.id, productId: product.id, quantity: it.quantity, sortOrder: idx } : null;
        }).filter(Boolean) as any[];
        if (itemValues.length) await db.insert(packageItemsTable).values(itemValues);
      }
    }
  }
  console.log("Seeded packages");

  console.log("Seeding events for Social Commerce Festival...");
  if (scf) {
    const cities = await db.select().from(citiesTable).where(eq(citiesTable.partnerId, scf.id));
    const venues = await db.select().from(venuesTable).where(eq(venuesTable.partnerId, scf.id));
    const findCity = (n: string) => cities.find(c => c.name === n);
    const findVenue = (n: string) => venues.find(v => v.name === n);

    const eventDefs = [
      { name: "SCF Miami 2026 Spring", cityName: "Miami", venueName: "Wynwood Walls Pavilion", eventStartDate: "2026-05-15", eventEndDate: "2026-05-17", installDate: "2026-05-14", teardownDate: "2026-05-18", shippingDeadline: "2026-05-08", status: "upcoming" },
      { name: "SCF Austin 2026 Summer", cityName: "Austin", venueName: "East Side Warehouse", eventStartDate: "2026-07-10", eventEndDate: "2026-07-12", installDate: "2026-07-09", teardownDate: "2026-07-13", shippingDeadline: "2026-07-03", status: "upcoming" },
      { name: "SCF Brooklyn 2026 Fall", cityName: "New York", venueName: "Brooklyn Navy Yard Pavilion", eventStartDate: "2026-09-22", eventEndDate: "2026-09-24", installDate: "2026-09-21", teardownDate: "2026-09-25", shippingDeadline: "2026-09-15", status: "upcoming" },
      { name: "SCF Miami 2025 Recap", cityName: "Miami", venueName: "Brickell Convention Center", eventStartDate: "2025-10-12", eventEndDate: "2025-10-14", status: "completed" },
    ];
    for (const e of eventDefs) {
      const existing = await db.select().from(eventsTable).where(and(eq(eventsTable.partnerId, scf.id), eq(eventsTable.name, e.name)));
      if (existing.length === 0) {
        const city = findCity(e.cityName);
        const venue = findVenue(e.venueName);
        await db.insert(eventsTable).values({
          partnerId: scf.id,
          cityId: city?.id,
          venueId: venue?.id,
          name: e.name,
          eventStartDate: e.eventStartDate,
          eventEndDate: e.eventEndDate,
          installDate: e.installDate,
          teardownDate: e.teardownDate,
          shippingDeadline: e.shippingDeadline,
          status: e.status,
          isActive: true,
        });
      }
    }
  }
  console.log("Seeded events");

  console.log("Seeding inventory...");
  if (scf) {
    const cities = await db.select().from(citiesTable).where(eq(citiesTable.partnerId, scf.id));
    const inventoryProducts = ["step-and-repeat", "retractable-banner", "backdrop", "sponsor-boards", "light-box", "foam-board", "a-frame"];
    for (const c of cities) {
      for (const slug of inventoryProducts) {
        const product = findP(slug);
        if (!product) continue;
        const existing = await db.select().from(inventoryTable).where(and(eq(inventoryTable.cityId, c.id), eq(inventoryTable.productId, product.id)));
        if (existing.length === 0) {
          await db.insert(inventoryTable).values({
            cityId: c.id, productId: product.id,
            hardwareOnHand: Math.floor(Math.random() * 8) + 2,
            reserved: Math.floor(Math.random() * 3),
            damaged: 0,
            graphicOnlyAvailable: true,
            lowInventoryThreshold: 2,
          });
        }
      }
    }
  }
  console.log("Seeded inventory");

  console.log("Seeding default super admin role...");
  const adminEmail = process.env.ADMIN_EMAIL ?? "admin@a3visual.com";
  const existingAdmin = await db.select().from(userRolesTable).where(eq(userRolesTable.email, adminEmail));
  if (existingAdmin.length === 0) {
    await db.insert(userRolesTable).values({ email: adminEmail, role: "super_admin", fullName: "Default Super Admin", isActive: true, acceptedAt: new Date() });
  }

  // -------------------------------------------------------------------------
  // Email Readiness demo data (idempotent).
  //
  // Gives the Email Readiness admin page a partner that is fully wired for
  // outbound email so a fresh environment shows what a "configured" partner
  // looks like rather than an empty checklist:
  //   - two ops recipients (primary + secondary) so internal routing has
  //     redundancy, exactly what the brief calls out for "this email reaches
  //     me and Sean"
  //   - one cc recipient
  //   - one historical email.sent event (proof that a send succeeded)
  //   - one historical email.failed event (so the failures list and Retry
  //     button are exercised in a fresh environment)
  // -------------------------------------------------------------------------
  console.log("Seeding email-readiness demo data...");
  const [demoPartner] = await db.select().from(partnersTable).where(eq(partnersTable.slug, "move-miami"));
  if (demoPartner) {
    const demoRecipients: Array<{ role: string; email: string; label: string; sortOrder: number }> = [
      { role: "ops", email: "ops-primary@movemiami.example", label: "Primary ops (orders)", sortOrder: 0 },
      { role: "ops", email: "ops-secondary@movemiami.example", label: "Secondary ops (redundancy)", sortOrder: 1 },
      { role: "cc", email: "ops-cc@movemiami.example", label: "Operations CC", sortOrder: 0 },
      { role: "finance", email: "billing@movemiami.example", label: "Finance / billing", sortOrder: 0 },
    ];
    for (const r of demoRecipients) {
      const existing = await db.select().from(partnerEmailRecipientsTable).where(and(
        eq(partnerEmailRecipientsTable.partnerId, demoPartner.id),
        eq(partnerEmailRecipientsTable.role, r.role),
        eq(partnerEmailRecipientsTable.email, r.email),
      ));
      if (existing.length === 0) {
        await db.insert(partnerEmailRecipientsTable).values({
          partnerId: demoPartner.id,
          role: r.role,
          email: r.email,
          label: r.label,
          isActive: true,
          sortOrder: r.sortOrder,
        });
      }
    }
    console.log(`  Seeded ${demoRecipients.length} role-based recipients for ${demoPartner.companyName}`);

    // Try to attach the demo events to a real order if one exists; otherwise
    // record them with no objectId so they still show up in the admin failures
    // / activity views.
    const [latestOrder] = await db.select().from(ordersTable).where(eq(ordersTable.partnerId, demoPartner.id)).limit(1);

    const sentMarker = "demo-seed:email.sent:move-miami";
    const failedMarker = "demo-seed:email.failed:move-miami";

    const existingSent = await db.select().from(usageEvents).where(and(
      eq(usageEvents.eventType, "email.sent"),
      eq(usageEvents.partnerId, demoPartner.id),
    ));
    const sentAlreadySeeded = existingSent.some(e => {
      const m = (e.meta ?? {}) as Record<string, unknown>;
      return m.seedMarker === sentMarker;
    });
    if (!sentAlreadySeeded) {
      await db.insert(usageEvents).values({
        eventType: "email.sent",
        partnerId: demoPartner.id,
        objectType: latestOrder ? "order" : null,
        objectId: latestOrder?.id ?? null,
        meta: {
          seedMarker: sentMarker,
          emailType: "order_confirmation",
          to: "events@movemiami.com",
          subject: "Your order has been received",
          providerId: "demo_resend_id_001",
        },
      });
    }

    const existingFailed = await db.select().from(usageEvents).where(and(
      eq(usageEvents.eventType, "email.failed"),
      eq(usageEvents.partnerId, demoPartner.id),
    ));
    const failedAlreadySeeded = existingFailed.some(e => {
      const m = (e.meta ?? {}) as Record<string, unknown>;
      return m.seedMarker === failedMarker;
    });
    if (!failedAlreadySeeded) {
      await db.insert(usageEvents).values({
        eventType: "email.failed",
        partnerId: demoPartner.id,
        objectType: latestOrder ? "order" : null,
        objectId: latestOrder?.id ?? null,
        meta: {
          seedMarker: failedMarker,
          emailType: "order_ops_forward",
          to: "ops-primary@movemiami.example",
          error: "demo: simulated provider 4xx — invalid recipient (seeded for admin visibility)",
        },
      });
    }
    console.log("  Demo email.sent + email.failed events ensured");
  } else {
    console.log("  Skipped — Move Miami partner not found");
  }

  console.log("Seed complete!");
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
