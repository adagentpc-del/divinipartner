import { generateAiSummary } from "./src/lib/aiSummary";

const requestData = {
  companyName: "Test Corp", contactName: "Alice",
  eventName: "Spring Launch", eventDate: "2026-06-15",
  venueName: "Convention Center", venueAddress: null,
  items: [
    { category: "Wall Graphic", itemName: "Lobby wall" },
    { category: "Window Decal", itemName: "Front windows" },
  ],
  designAssistanceRequested: true, customFabricationRequested: false,
  immersiveRequested: false, promotionalItemsRequested: false,
  additionalNotes: "Need pricing by next week.", uploads: [],
};

async function main() {
  console.log("=== Run 1: cold ===");
  const r1 = await generateAiSummary(requestData, { requestId: 9002, partnerId: 1 });
  console.log(`  usedAi=${r1.usedAi} hash=${r1.inputHash.slice(0,16)}`);

  console.log("=== Run 2: priorHash + summary → reuse ===");
  const r2 = await generateAiSummary(requestData, {
    requestId: 9002, partnerId: 1, priorHash: r1.inputHash, priorSummary: r1.text,
  });
  console.log(`  usedAi=${r2.usedAi} hashMatches=${r2.inputHash===r1.inputHash}`);

  console.log("=== Run 3: same data, items shuffled (sort-stability) → reuse ===");
  const shuffled = { ...requestData, items: [...requestData.items].reverse() };
  const r3 = await generateAiSummary(shuffled, {
    requestId: 9002, partnerId: 1, priorHash: r1.inputHash, priorSummary: r1.text,
  });
  console.log(`  usedAi=${r3.usedAi} hashMatches=${r3.inputHash===r1.inputHash}`);

  console.log("=== Run 4: simulate AI failure path → broken API key, expect usedAi=false ===");
  const savedKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  process.env.AI_INTEGRATIONS_OPENAI_API_KEY = "sk-broken-test";
  // Need to bust the singleton - simplest: import a fresh copy. Skipping full
  // reload; the SDK reads apiKey at construction, and singleton was already
  // built. Instead, point baseURL at a guaranteed-404 host.
  process.env.AI_INTEGRATIONS_OPENAI_API_KEY = savedKey;
  process.env.AI_INTEGRATIONS_OPENAI_BASE_URL = "https://invalid.example.localhost:9";
  // Force a fresh module load to rebuild the singleton with the bad URL
  delete require.cache[require.resolve("./src/lib/aiModels")];
  delete require.cache[require.resolve("./src/lib/aiSummary")];
  const { generateAiSummary: gen2 } = await import("./src/lib/aiSummary?broken=1" as any).catch(() => import("./src/lib/aiSummary"));
  const r4 = await gen2({ ...requestData, additionalNotes: "different notes to bust cache" }, { requestId: 9002, partnerId: 1 });
  console.log(`  usedAi=${r4.usedAi} hashReturned=${!!r4.inputHash} textNonEmpty=${r4.text.length>0}`);
  console.log(`  → Caller would persist hash=${r4.usedAi ? "<inputHash>" : "null"}`);

  const ok = r1.usedAi && !r2.usedAi && !r3.usedAi && r3.inputHash===r1.inputHash && !r4.usedAi;
  console.log(ok ? "PASS" : "FAIL"); process.exit(ok?0:1);
}
main().catch(e => { console.error(e); process.exit(1); });
