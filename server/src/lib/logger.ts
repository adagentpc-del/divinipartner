/**
 * Structured JSON logging + a pluggable error-monitoring sink.
 *
 * Closes the "no structured logging or error monitoring" gap from the
 * 2026-08-03 SOC 2 / ISO 27001 audit (AI_PROJECT_OS/53_SOC2_ISO27001_AUDIT.md):
 * every log line is one JSON object per line (ts, level, msg, ...context),
 * trivially greppable/parseable by any log aggregator (CloudWatch, Datadog,
 * a self-hosted ELK/Loki stack, or just `jq` over a file) without coupling
 * this app to a specific vendor's SDK.
 *
 * Error monitoring is real but OFF by default, matching this codebase's
 * existing pattern for every other optional integration (Stripe, PayPal,
 * S3, AV scan): when ERROR_MONITORING_WEBHOOK_URL is set, every
 * logger.error() call also POSTs a JSON payload to that URL, best-effort
 * and non-blocking. This is deliberately a generic webhook rather than a
 * Sentry (or any other vendor) SDK -- it works with a Slack incoming
 * webhook, a custom collector, or a Sentry-compatible ingestion proxy alike,
 * with zero new dependencies. Set it to whatever the operator's actual
 * monitoring stack accepts.
 *
 * Zero em dashes.
 */
import { ERROR_MONITORING_WEBHOOK_URL, IS_PROD } from "../config.js";

export type LogContext = Record<string, unknown>;

interface LogLine {
  ts: string;
  level: "info" | "warn" | "error";
  msg: string;
  [key: string]: unknown;
}

function write(level: LogLine["level"], msg: string, context?: LogContext): LogLine {
  const line: LogLine = { ts: new Date().toISOString(), level, msg, ...context };
  const json = JSON.stringify(line);
   
  if (level === "error") console.error(json);
   
  else console.log(json);
  return line;
}

/** Best-effort, non-blocking, never throws: fire the error-monitoring webhook. */
function notifyErrorMonitoring(line: LogLine): void {
  if (!ERROR_MONITORING_WEBHOOK_URL) return;
  fetch(ERROR_MONITORING_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...line, app: "divini-partners", env: IS_PROD ? "production" : "development" }),
  }).catch(() => {
    // The webhook itself failing must never break the request/process that
    // triggered the original error -- swallow deliberately.
  });
}

export const logger = {
  info(msg: string, context?: LogContext): void {
    write("info", msg, context);
  },
  warn(msg: string, context?: LogContext): void {
    write("warn", msg, context);
  },
  /** Logs structured JSON to stderr AND fires the error-monitoring webhook if configured. */
  error(msg: string, context?: LogContext): void {
    notifyErrorMonitoring(write("error", msg, context));
  },
};
