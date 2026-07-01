/**
 * Email test harness CLI.
 *
 * Sends ONE sample of every platform email type to a target address using the
 * real email transport (lib/email.ts), so the owner can run it on the deployed
 * server and confirm receipt of each. Run with:
 *
 *   node server/dist/test-emails.js adagentpc@gmail.com
 *
 * Real delivery requires EMAIL_PROVIDER + EMAIL_API_KEY (and POSTAL_API_URL for
 * postal) in the environment. Without them, emailEnabled() is false: every type
 * reports "skipped (logged)" and nothing is actually transmitted. This still
 * proves the wiring end to end.
 *
 * This entry does NOT need the database; email send is independent of Postgres.
 * The pool is still closed at the end so the process exits cleanly.
 *
 * Password reset and login are handled by Authentik (OIDC), not by Divini email,
 * so they are intentionally not part of this suite.
 *
 * ZERO em dashes in this file (hard rule). ESM .js imports.
 */
import { pathToFileURL } from "node:url";
import { notify } from "./lib/notify.js";
import { sendEmail, emailEnabled } from "./lib/email.js";
import { renderTemplate } from "./lib/claim-emails.js";
import { pool } from "./pool.js";

type Outcome = "ok" | "skipped" | "error";

export interface SuiteRow {
  label: string;
  subject: string;
  outcome: Outcome;
  detail?: string;
}

/** Map a sendEmail/notify result into a normalized suite outcome. */
function classify(res: { ok: boolean; skipped?: boolean; error?: string; id?: string }): {
  outcome: Outcome;
  detail?: string;
} {
  if (res.skipped) return { outcome: "skipped", detail: "logged, not sent" };
  if (res.ok) return { outcome: "ok", detail: res.id ? `id=${res.id}` : undefined };
  return { outcome: "error", detail: res.error ?? "unknown error" };
}

/**
 * Run every email type once to `target`, collecting one row per type. Exported
 * so the admin endpoint (routes/test-email.ts) can reuse the exact same suite.
 */
export async function runEmailSuite(target: string): Promise<SuiteRow[]> {
  const rows: SuiteRow[] = [];

  // Each entry: a label, the subject we expect, and a thunk that performs the
  // send and returns the transport result. notify.* builders call sendEmail
  // internally and resolve to the payload, so for those we capture the result
  // by sending through sendEmail-equivalent paths. To get the real transport
  // result for the table, we send the notify subject/body via the same builder
  // and additionally probe the transport directly where a result is needed.
  //
  // notify.* resolve to the NotifyPayload (not the EmailResult), so we wrap each
  // in a helper that runs the builder (which sends for real) and reports the
  // transport state from emailEnabled(): when disabled it is skipped, when
  // enabled the builder already dispatched and we treat dispatch as ok unless it
  // threw. For full transport-result fidelity, the invite and claim samples use
  // sendEmail directly and surface the precise EmailResult.

  async function viaNotify(
    label: string,
    subject: string,
    run: () => Promise<unknown>,
  ): Promise<void> {
    try {
      await run();
      const res = emailEnabled() ? { ok: true } : { ok: false, skipped: true };
      const c = classify(res);
      rows.push({ label, subject, outcome: c.outcome, detail: c.detail });
    } catch (e) {
      rows.push({ label, subject, outcome: "error", detail: (e as Error).message });
    }
  }

  async function viaSend(
    label: string,
    subject: string,
    msg: Parameters<typeof sendEmail>[0],
  ): Promise<void> {
    try {
      const res = await sendEmail(msg);
      const c = classify(res);
      rows.push({ label, subject, outcome: c.outcome, detail: c.detail });
    } catch (e) {
      rows.push({ label, subject, outcome: "error", detail: (e as Error).message });
    }
  }

  // 1. Welcome / registration
  await viaNotify("Welcome / registration", "Welcome to Divini Partners, Test Venue", () =>
    notify.welcome(target, "Test Venue"),
  );

  // 2. Bid posted
  await viaNotify("Bid posted", "New bid posted for Test Gala 2026", () =>
    notify.bidPosted(target, "Test Gala 2026", { url: "https://divinipartners.com/events/test" }),
  );

  // 3. Bid invited
  await viaNotify("Bid invited", "You were invited to bid on Test Gala 2026", () =>
    notify.bidInvited(target, "Test Gala 2026", { url: "https://divinipartners.com/events/test" }),
  );

  // 4. Quote submitted
  await viaNotify("Quote submitted", "New quote for Test Gala 2026", () =>
    notify.quoteSubmitted(target, "Test Gala 2026", { url: "https://divinipartners.com/events/test" }),
  );

  // 5. Quote decision (accepted)
  await viaNotify("Quote decision (accepted)", "Quote accepted", () =>
    notify.quoteDecision(target, "accepted", { url: "https://divinipartners.com/events/test" }),
  );

  // 6. Message posted
  await viaNotify("Message posted", "New message on Test Gala 2026", () =>
    notify.messagePosted(target, "Test Gala 2026", {
      message: "Hi, can we confirm the load-in time?",
      url: "https://divinipartners.com/events/test",
    }),
  );

  // 7. Event status changed
  await viaNotify("Event status changed", "Test Gala 2026 is now confirmed", () =>
    notify.eventStatusChanged(target, "Test Gala 2026", "confirmed", {
      url: "https://divinipartners.com/events/test",
    }),
  );

  // 8. Invoice sent
  await viaNotify("Invoice sent", "Invoice INV-1001 from Divini Partners", () =>
    notify.invoiceSent(target, "INV-1001", { url: "https://divinipartners.com/invoices/INV-1001" }),
  );

  // 9. Payment received
  await viaNotify("Payment received", "Payment received: $2,500.00", () =>
    notify.paymentReceived(target, "$2,500.00", { url: "https://divinipartners.com/invoices/INV-1001" }),
  );

  // 10. Support received
  await viaNotify("Support received", "We received your support request (SUP-2026)", () =>
    notify.supportReceived(target, "SUP-2026"),
  );

  // 11. Feature request received
  await viaNotify("Feature request received", "We received your feature request", () =>
    notify.featureRequestReceived(target),
  );

  // 12. Invite (sent directly through the transport with a sample invite body)
  await viaSend("Invite", "You are invited to join Divini Partners", {
    to: target,
    subject: "You are invited to join Divini Partners",
    text: [
      "You have been invited to join Divini Partners by Divini Group.",
      "Click the link below to accept your invitation and set up your account.",
      "Accept invitation: https://divinipartners.com/invite/sample-token",
    ].join("\n\n"),
  });

  // 13. Claim outreach step 1 (the only sample carrying open/click tracking)
  const claim = renderTemplate(1, {
    businessName: "Test Venue",
    city: "Miami",
    category: "Hotels and Resorts",
    slug: "test-venue",
    email: target,
  });
  await viaSend("Claim outreach (step 1)", claim.subject, {
    to: target,
    subject: claim.subject,
    text: claim.body,
    // trackingRef is intentionally omitted here: a real claim send uses the
    // claim_outreach row id. We still flag in the doc that this is the type that
    // carries tracking in production.
  });

  return rows;
}

/** Render a clean fixed-width table of the suite results. */
function renderTable(rows: SuiteRow[]): string {
  const head = { label: "EMAIL TYPE", subject: "SUBJECT", outcome: "RESULT", detail: "DETAIL" };
  const all = [head, ...rows.map((r) => ({ ...r, outcome: r.outcome.toUpperCase() }))];
  const w = (key: keyof typeof head) =>
    Math.max(...all.map((r) => String((r as Record<string, string>)[key] ?? "").length));
  const wl = w("label");
  const ws = w("subject");
  const wo = w("outcome");
  const pad = (s: string, n: number) => s + " ".repeat(Math.max(0, n - s.length));
  const line = (r: { label: string; subject: string; outcome: string; detail?: string }) =>
    `  ${pad(r.label, wl)}  ${pad(r.subject, ws)}  ${pad(r.outcome, wo)}  ${r.detail ?? ""}`.trimEnd();
  const sep = `  ${"-".repeat(wl)}  ${"-".repeat(ws)}  ${"-".repeat(wo)}  ${"-".repeat(6)}`;
  const out: string[] = [];
  out.push(line(head));
  out.push(sep);
  for (const r of rows) {
    out.push(line({ label: r.label, subject: r.subject, outcome: r.outcome.toUpperCase(), detail: r.detail }));
  }
  return out.join("\n");
}

async function main(): Promise<void> {
  const target = process.argv[2] || process.env.TEST_EMAIL || "adagentpc@gmail.com";

  // eslint-disable-next-line no-console
  console.log(`\nDivini Partners email test harness`);
  // eslint-disable-next-line no-console
  console.log(`Target recipient: ${target}\n`);

  if (!emailEnabled()) {
    // eslint-disable-next-line no-console
    console.log(
      [
        "================================================================",
        " EMAIL IS DISABLED",
        " EMAIL_PROVIDER and/or EMAIL_API_KEY are not set in this",
        " environment (postal also needs POSTAL_API_URL). Every type below",
        " will report SKIPPED (logged) and NOTHING is actually sent.",
        " This still proves the wiring. Set the env vars to send for real.",
        "================================================================",
      ].join("\n") + "\n",
    );
  } else {
    // eslint-disable-next-line no-console
    console.log("Email is ENABLED. Sending one sample of each type for real.\n");
  }

  const rows = await runEmailSuite(target);

  // eslint-disable-next-line no-console
  console.log(renderTable(rows) + "\n");

  const ok = rows.filter((r) => r.outcome === "ok").length;
  const skipped = rows.filter((r) => r.outcome === "skipped").length;
  const errored = rows.filter((r) => r.outcome === "error").length;
  // eslint-disable-next-line no-console
  console.log(`Totals: ${ok} sent, ${skipped} skipped, ${errored} error(s), ${rows.length} types.\n`);

  // eslint-disable-next-line no-console
  console.log(
    [
      "Note: password reset and login emails are handled by Authentik (OIDC),",
      "not by Divini Partners email, so they are intentionally not in this suite.",
      "Note: the claim outreach sample is the only type that carries open/click",
      "tracking in production (its claim_outreach row id is the tracking ref).",
    ].join("\n") + "\n",
  );

  await pool.end().catch(() => null);
  // Exit non-zero only on a hard error (a thrown send). Skipped is expected when
  // email is disabled and is NOT a failure.
  process.exit(errored > 0 ? 1 : 0);
}

// Only run the suite when this file is executed DIRECTLY (the CLI), never when
// imported as a module (e.g. by routes/test-email.ts or the server boot). Without
// this guard, loading the route tree would fire the whole email suite on every
// server start. The admin endpoint imports runEmailSuite() and calls it on demand.
const invokedDirectly =
  !!process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  main().catch(async (err) => {
    // eslint-disable-next-line no-console
    console.error(`[test-emails] run failed: ${err instanceof Error ? err.message : String(err)}`);
    try {
      await pool.end();
    } catch {
      // ignore pool teardown errors on a failing exit
    }
    process.exit(1);
  });
}
