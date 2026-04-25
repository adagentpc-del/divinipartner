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
  const t1 = Date.now();
  const r1 = await generateAiSummary(requestData, { requestId: 9001, partnerId: 1 });
  console.log(`  usedAi=${r1.usedAi} ms=${Date.now()-t1} hash=${r1.inputHash.slice(0,16)} textLen=${r1.text.length}`);

  console.log("=== Run 2: priorHash matches → reuse ===");
  const t2 = Date.now();
  const r2 = await generateAiSummary(requestData, {
    requestId: 9001, partnerId: 1, priorHash: r1.inputHash, priorSummary: r1.text,
  });
  console.log(`  usedAi=${r2.usedAi} ms=${Date.now()-t2} hashMatches=${r2.inputHash===r1.inputHash} textIdentical=${r2.text===r1.text}`);

  console.log("=== Run 3: company changed → re-run ===");
  const t3 = Date.now();
  const r3 = await generateAiSummary({...requestData, companyName: "Other Corp"}, {
    requestId: 9001, partnerId: 1, priorHash: r1.inputHash, priorSummary: r1.text,
  });
  console.log(`  usedAi=${r3.usedAi} ms=${Date.now()-t3} hashChanged=${r3.inputHash!==r1.inputHash}`);

  const ok = r1.usedAi && !r2.usedAi && r2.text===r1.text && r2.inputHash===r1.inputHash && r3.usedAi && r3.inputHash!==r1.inputHash;
  console.log(ok ? "PASS" : "FAIL"); process.exit(ok?0:1);
}
main().catch(e => { console.error(e); process.exit(1); });
