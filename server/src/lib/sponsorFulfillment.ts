/**
 * Workstream C - sponsor fulfillment helpers.
 *
 * Thin orchestration layer over the sponsor-purchases data module: seeds the
 * fulfillment checklist for a purchase, resolves who to notify (the nonprofit
 * org that owns the package, and the sponsor org), and decides when a fulfillment
 * deliverable or a missing brand asset warrants a notification.
 *
 * Everything here is best-effort: notification helpers never throw and never
 * block the request that triggered them. Cross-workstream reads (the B
 * sponsorship_packages / fundraising_events tables, queried by name) degrade
 * gracefully when those tables are not yet seeded.
 *
 * Zero em dashes.
 */
import { q1 } from "../pool.js";
import { notify } from "./notify.js";
import { orgEmails } from "./recipients.js";
import * as repo from "../db/sponsor-purchases.js";

/**
 * The display name of the fundraising event a purchase belongs to, for subject
 * lines. Reads the Workstream B fundraising_events table by name. Falls back to
 * the package name, then a generic label. Never throws.
 */
export async function purchaseEventLabel(purchase: repo.SponsorPurchase): Promise<string> {
  if (purchase.fundraising_event_id) {
    const ev = await q1<{ name: string | null }>(
      `select name from fundraising_events where id = $1`,
      [purchase.fundraising_event_id],
    ).catch(() => null);
    if (ev?.name) return ev.name;
  }
  if (purchase.sponsorship_package_id) {
    const pkg = await repo.getPackageById(purchase.sponsorship_package_id);
    if (pkg?.name) return pkg.name;
  }
  return "your fundraising event";
}

/** Contacts for the nonprofit org that owns the package backing this purchase. */
export async function nonprofitRecipients(purchaseId: string): Promise<string[]> {
  const orgId = await repo.nonprofitOrgForPurchase(purchaseId).catch(() => null);
  if (!orgId) return [];
  return orgEmails([orgId]).catch(() => []);
}

/** Contacts for the sponsor org behind a purchase. */
export async function sponsorRecipients(purchase: repo.SponsorPurchase): Promise<string[]> {
  if (!purchase.sponsor_org_id) return [];
  return orgEmails([purchase.sponsor_org_id]).catch(() => []);
}

/**
 * Seed sponsor_fulfillment_tasks for a purchase from its package's
 * fulfillment_checklist. Idempotent (the repo no-ops when tasks already exist).
 * Returns the seeded (or existing) task list. Best-effort: returns [] on error.
 */
export async function seedFulfillment(
  purchase: repo.SponsorPurchase,
): Promise<repo.FulfillmentTask[]> {
  if (!purchase.sponsorship_package_id) return [];
  const pkg = await repo.getPackageById(purchase.sponsorship_package_id).catch(() => null);
  return repo
    .seedTasksFromChecklist(purchase.id, pkg?.fulfillment_checklist)
    .catch(() => [] as repo.FulfillmentTask[]);
}

/**
 * Notify the nonprofit that a sponsor expressed interest. Best-effort.
 */
export async function notifyInterest(purchase: repo.SponsorPurchase): Promise<void> {
  try {
    const [to, label] = await Promise.all([
      nonprofitRecipients(purchase.id),
      purchaseEventLabel(purchase),
    ]);
    if (to.length === 0) return;
    await notify.sponsorInterest(to, label, { purchase_id: purchase.id });
  } catch {
    // best-effort
  }
}

/**
 * Notify the nonprofit that a sponsor completed payment. Best-effort.
 */
export async function notifyPurchased(purchase: repo.SponsorPurchase): Promise<void> {
  try {
    const [to, label] = await Promise.all([
      nonprofitRecipients(purchase.id),
      purchaseEventLabel(purchase),
    ]);
    if (to.length === 0) return;
    await notify.sponsorPurchased(to, label, {
      purchase_id: purchase.id,
      amount: purchase.amount,
    });
  } catch {
    // best-effort
  }
}

/**
 * After a purchase reaches the paid stage, flag any brand asset the sponsor still
 * owes (logo and/or ad artwork). When something is missing we notify the sponsor.
 * Best-effort; returns the list of missing asset keys for the caller's response.
 */
export async function notifyMissingAssetsIfAny(
  purchase: repo.SponsorPurchase,
): Promise<string[]> {
  const missing: string[] = [];
  if (!purchase.logo_url) missing.push("logo");
  if (!purchase.ad_file_url) missing.push("ad_artwork");
  if (missing.length === 0) return missing;
  try {
    const [to, label] = await Promise.all([
      sponsorRecipients(purchase),
      purchaseEventLabel(purchase),
    ]);
    if (to.length > 0) {
      await notify.sponsorMissingAsset(to, label, {
        purchase_id: purchase.id,
        missing,
      });
    }
  } catch {
    // best-effort
  }
  return missing;
}

/**
 * Notify both sides that a fulfillment task is due. Called when a task with a
 * due_date is created or advanced. Best-effort.
 */
export async function notifyFulfillmentDue(
  purchase: repo.SponsorPurchase,
  task: repo.FulfillmentTask,
): Promise<void> {
  try {
    const [npTo, label] = await Promise.all([
      nonprofitRecipients(purchase.id),
      purchaseEventLabel(purchase),
    ]);
    if (npTo.length === 0) return;
    await notify.sponsorFulfillmentDue(npTo, label, {
      purchase_id: purchase.id,
      task_id: task.id,
      task_label: task.label,
      due_date: task.due_date,
    });
  } catch {
    // best-effort
  }
}
