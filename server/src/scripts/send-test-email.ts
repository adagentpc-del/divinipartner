/**
 * Send a single test email to verify the transport before go-live.
 *
 * Usage (from the server package, after build or via tsx/ts-node):
 *   node dist/scripts/send-test-email.js you@example.com
 *   EMAIL_TEST_TO=you@example.com node dist/scripts/send-test-email.js
 *
 * Reads the same EMAIL_PROVIDER / EMAIL_API_KEY / EMAIL_FROM config as the app.
 * If email is not configured, sendEmail() reports "skipped" and this script
 * exits non-zero so a misconfiguration is obvious. Dependency free.
 *
 * Zero em dashes.
 */
import { sendEmail } from "../lib/email.js";
import { EMAIL_PROVIDER, EMAIL_FROM, emailEnabled } from "../config.js";

async function main(): Promise<void> {
  const to = (process.argv[2] || process.env.EMAIL_TEST_TO || "").trim();
  if (!to) {
    console.error(
      "Provide a recipient: node dist/scripts/send-test-email.js you@example.com (or set EMAIL_TEST_TO).",
    );
    process.exitCode = 2;
    return;
  }

  if (!emailEnabled()) {
    console.error(
      "Email is not configured. Set EMAIL_PROVIDER (resend|postal), EMAIL_API_KEY, and EMAIL_FROM, then retry.",
    );
    process.exitCode = 1;
    return;
  }

  console.log(`Sending test email via provider="${EMAIL_PROVIDER}" from="${EMAIL_FROM}" to="${to}" ...`);

  const result = await sendEmail({
    to,
    subject: "Divini Partners email test",
    text:
      "This is a test email from Divini Partners.\n\n" +
      "If you received this, your EMAIL_PROVIDER, EMAIL_API_KEY, and EMAIL_FROM are configured correctly " +
      "and outbound mail is working. Sent at " +
      new Date().toISOString() +
      ".",
  });

  if (result.ok) {
    console.log(`OK. Delivered to the provider${result.id ? ` (id=${result.id})` : ""}.`);
    return;
  }
  if (result.skipped) {
    console.error("Email was skipped (transport not enabled). Check your EMAIL_* env vars.");
    process.exitCode = 1;
    return;
  }
  console.error(`Failed: ${result.error ?? "unknown error"}`);
  process.exitCode = 1;
}

main().catch((err) => {
  console.error("send-test-email crashed:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
