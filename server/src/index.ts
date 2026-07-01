import app from "./app.js";
import { PORT } from "./config.js";
import { startSchedulerLoop } from "./lib/scheduler.js";
import { assertProductionSecrets } from "./lib/startup-check.js";

// Fail fast (in production) if a processor is enabled without its webhook secret.
assertProductionSecrets();

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`[divini-partners] server listening on :${PORT}`);
  // In-process automation loop (no-op unless WORKER_INTERVAL_MINUTES > 0).
  startSchedulerLoop();
});
