import app from "./app.js";
import { PORT, IS_PROD } from "./config.js";
import { startSchedulerLoop } from "./lib/scheduler.js";
import { assertProductionSecrets } from "./lib/startup-check.js";
import { logger } from "./lib/logger.js";

// Fail fast (in production) if a processor is enabled without its webhook secret.
assertProductionSecrets();

// Structured logging / error monitoring (SOC 2 / ISO 27001 audit,
// 2026-08-03): an uncaught exception or unhandled promise rejection outside
// Express's own request handling (which errorHandler in routes.ts already
// covers) previously just crashed with a raw stack trace on stderr, or
// worse, left Node running in a possibly-corrupted state. Log it structured
// (and fire the error-monitoring webhook if configured), then exit in
// production so pm2 restarts into a clean process rather than continuing --
// see AI_PROJECT_OS/23_DEPLOYMENT.md for the pm2 setup that makes this safe.
process.on("uncaughtException", (err) => {
  logger.error("uncaughtException", { error: err.message, stack: err.stack });
  if (IS_PROD) process.exit(1);
});
process.on("unhandledRejection", (reason) => {
  const err = reason instanceof Error ? reason : new Error(String(reason));
  logger.error("unhandledRejection", { error: err.message, stack: err.stack });
  if (IS_PROD) process.exit(1);
});

app.listen(PORT, () => {
  logger.info("server listening", { port: PORT });
  // In-process automation loop (no-op unless WORKER_INTERVAL_MINUTES > 0).
  startSchedulerLoop();
});
