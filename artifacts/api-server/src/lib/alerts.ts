import { and, desc, eq, gt, gte, inArray, isNotNull, isNull, lt, ne, or, sql } from "drizzle-orm";
import {
  db,
  partnersTable,
  ordersTable,
  assetsTable,
  partnerEmailRecipientsTable,
  usageEvents,
} from "@workspace/db";
import { emailConfigStatus } from "./email";

// Section 32 — derived operational alerts.
//
// The whole alert system is computed on-the-fly from existing tables (no new
// schema for the alerts themselves). Each alert gets a stable `key` so the UI
// can reference it deterministically across requests.

export type AlertSeverity = "critical" | "warning" | "info";

export type AlertType =
  | "failed_email"
  | "missing_artwork"
  | "order_exception"
  | "inactive_partner"
  | "stale_partner_setup"
  | "unresolved_support_issue"
  | "missing_contact_config"
  | "asset_issue"
  | "manual_followup";

export interface Alert {
  key: string;                    // stable id (used by UI dedupe + future dismiss)
  type: AlertType;
  severity: AlertSeverity;
  title: string;
  detail: string;
  partnerId: number | null;
  partnerName: string | null;
  orderId: number | null;
  assetId: number | null;
  link: string | null;            // suggested admin link
  occurredAt: Date;               // when this condition started / last observed
  meta?: Record<string, unknown>;
}

const DAY = 24 * 60 * 60 * 1000;

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * DAY);
}

interface ComputeOpts {
  partnerId?: number;             // narrow to one partner (used by partner detail)
  orderId?: number;               // narrow to one order (used by order detail)
  failedEmailWindowDays?: number; // default 7
  staleSetupDays?: number;        // default 30
  inactiveOrderDays?: number;     // default 60
  staleAssetDays?: number;        // default 90
}

export async function computeAlerts(opts: ComputeOpts = {}): Promise<Alert[]> {
  const failedEmailWindow = opts.failedEmailWindowDays ?? 7;
  const staleSetupDays = opts.staleSetupDays ?? 30;
  const inactiveOrderDays = opts.inactiveOrderDays ?? 60;
  const staleAssetDays = opts.staleAssetDays ?? 90;

  // Pull partners once and index by id — referenced by every alert builder.
  const partnerWhere = opts.partnerId ? eq(partnersTable.id, opts.partnerId) : undefined;
  const partners = await db.select().from(partnersTable).where(partnerWhere as any);
  const partnersById = new Map(partners.map(p => [p.id, p]));
  const partnerName = (id: number | null) => (id != null ? partnersById.get(id)?.companyName ?? null : null);
  const allPartnerIds = partners.map(p => p.id);

  const out: Alert[] = [];

  // ---- 1. failed_email — recent email.failed events from usage_events
  if (allPartnerIds.length > 0) {
    const failedEmails = await db.select({
      id: usageEvents.id,
      partnerId: usageEvents.partnerId,
      objectType: usageEvents.objectType,
      objectId: usageEvents.objectId,
      meta: usageEvents.meta,
      createdAt: usageEvents.createdAt,
    }).from(usageEvents).where(and(
      eq(usageEvents.eventType, "email.failed"),
      gte(usageEvents.createdAt, daysAgo(failedEmailWindow)),
      opts.partnerId ? eq(usageEvents.partnerId, opts.partnerId) : (sql`1=1` as any),
      opts.orderId ? and(eq(usageEvents.objectType, "order"), eq(usageEvents.objectId, opts.orderId)) : (sql`1=1` as any),
    ) as any).orderBy(desc(usageEvents.createdAt)).limit(200);

    for (const ev of failedEmails) {
      const meta = (ev.meta as any) || {};
      out.push({
        key: `failed_email:${ev.id}`,
        type: "failed_email",
        severity: "critical",
        title: `Email send failed${meta.type ? ` (${meta.type})` : ""}`,
        detail: meta.error ? String(meta.error).slice(0, 240) : "Resend reported a delivery failure",
        partnerId: ev.partnerId,
        partnerName: partnerName(ev.partnerId),
        orderId: ev.objectType === "order" ? ev.objectId : null,
        assetId: null,
        link: ev.objectType === "order" && ev.objectId ? `/admin/orders/${ev.objectId}` : `/admin/email-readiness`,
        occurredAt: ev.createdAt,
        meta: { to: meta.to, subject: meta.subject, providerId: meta.providerId },
      });
    }
  }

  // ---- 2. order_exception — orders flagged via Section 30 exception state
  const orderWhere: any[] = [ne(ordersTable.exceptionState, "none")];
  if (opts.partnerId) orderWhere.push(eq(ordersTable.partnerId, opts.partnerId));
  if (opts.orderId) orderWhere.push(eq(ordersTable.id, opts.orderId));
  const exceptionOrders = await db.select({
    id: ordersTable.id,
    partnerId: ordersTable.partnerId,
    exceptionState: ordersTable.exceptionState,
    exceptionType: ordersTable.exceptionType,
    updatedAt: ordersTable.updatedAt,
  }).from(ordersTable).where(and(...orderWhere) as any).limit(500);

  for (const o of exceptionOrders) {
    out.push({
      key: `order_exception:${o.id}`,
      type: "order_exception",
      severity: o.exceptionState === "blocked" ? "critical" : "warning",
      title: `Order #${o.id} flagged: ${o.exceptionType || o.exceptionState}`,
      detail: `Exception state: ${o.exceptionState}`,
      partnerId: o.partnerId,
      partnerName: partnerName(o.partnerId),
      orderId: o.id,
      assetId: null,
      link: `/admin/orders/${o.id}`,
      occurredAt: o.updatedAt,
    });
  }

  // ---- 3. missing_artwork — orders that are not new/cancelled but have no
  // current+approved asset attached. Cheap derivation: per-order asset count.
  {
    const assetCountWhere = [isNotNull(assetsTable.orderId)] as any[];
    if (opts.partnerId) assetCountWhere.push(eq(assetsTable.partnerId, opts.partnerId));
    if (opts.orderId) assetCountWhere.push(eq(assetsTable.orderId, opts.orderId));
    const orderAssetCounts = await db.select({
      orderId: assetsTable.orderId,
      approved: sql<number>`sum(case when ${assetsTable.approvalStatus} = 'approved' and ${assetsTable.isCurrent} = true then 1 else 0 end)::int`,
      total: sql<number>`count(*)::int`,
    }).from(assetsTable).where(and(...assetCountWhere) as any).groupBy(assetsTable.orderId);
    const approvedByOrder = new Map(orderAssetCounts.map(r => [r.orderId as number, r.approved]));

    const liveOrders = await db.select({
      id: ordersTable.id,
      partnerId: ordersTable.partnerId,
      status: ordersTable.status,
      createdAt: ordersTable.createdAt,
    }).from(ordersTable).where(and(
      // Orders that are past "new" but not cancelled — those should have art.
      inArray(ordersTable.status, ["confirmed", "in_production", "ready", "shipped", "completed"]),
      opts.partnerId ? eq(ordersTable.partnerId, opts.partnerId) : (sql`1=1` as any),
      opts.orderId ? eq(ordersTable.id, opts.orderId) : (sql`1=1` as any),
    ) as any).limit(500);

    for (const o of liveOrders) {
      if ((approvedByOrder.get(o.id) ?? 0) === 0) {
        out.push({
          key: `missing_artwork:${o.id}`,
          type: "missing_artwork",
          severity: "warning",
          title: `Order #${o.id} has no approved artwork`,
          detail: `Status is "${o.status}" but no current+approved asset is attached`,
          partnerId: o.partnerId,
          partnerName: partnerName(o.partnerId),
          orderId: o.id,
          assetId: null,
          link: `/admin/orders/${o.id}`,
          occurredAt: o.createdAt,
        });
      }
    }
  }

  // ---- 4. inactive_partner — explicitly inactive, archived, or live but
  // dormant for a long time.
  if (!opts.orderId) {
    // Last order timestamp per partner — used for dormancy detection.
    const lastOrderRows = await db.select({
      partnerId: ordersTable.partnerId,
      lastOrderAt: sql<Date>`max(${ordersTable.createdAt})`,
    }).from(ordersTable)
      .where(opts.partnerId ? eq(ordersTable.partnerId, opts.partnerId) : (sql`1=1` as any))
      .groupBy(ordersTable.partnerId);
    const lastOrderByPartner = new Map<number, Date>(lastOrderRows.map(r => [r.partnerId as number, r.lastOrderAt as Date]));

    for (const p of partners) {
      const archived = !!p.archivedAt;
      const inactive = !p.isActive;
      const last = lastOrderByPartner.get(p.id);
      const dormant = p.launchStatus === "live" && !archived && !inactive && (!last || last < daysAgo(inactiveOrderDays));

      if (archived) {
        out.push({
          key: `inactive_partner:archived:${p.id}`,
          type: "inactive_partner",
          severity: "warning",
          title: `Partner archived: ${p.companyName}`,
          detail: p.archivedReason || "Marked archived by an admin",
          partnerId: p.id, partnerName: p.companyName,
          orderId: null, assetId: null,
          link: `/admin/partners/${p.id}`,
          occurredAt: p.archivedAt as Date,
        });
      } else if (inactive) {
        out.push({
          key: `inactive_partner:disabled:${p.id}`,
          type: "inactive_partner",
          severity: "warning",
          title: `Partner disabled: ${p.companyName}`,
          detail: "is_active = false",
          partnerId: p.id, partnerName: p.companyName,
          orderId: null, assetId: null,
          link: `/admin/partners/${p.id}`,
          occurredAt: p.updatedAt ?? p.createdAt,
        });
      } else if (dormant) {
        out.push({
          key: `inactive_partner:dormant:${p.id}`,
          type: "inactive_partner",
          severity: "info",
          title: `${p.companyName}: no orders in ${inactiveOrderDays} days`,
          detail: last ? `Last order: ${last.toISOString().slice(0,10)}` : "No orders on record",
          partnerId: p.id, partnerName: p.companyName,
          orderId: null, assetId: null,
          link: `/admin/partners/${p.id}`,
          occurredAt: last ?? p.createdAt,
          meta: { lastOrderAt: last ?? null },
        });
      }
    }
  }

  // ---- 5. stale_partner_setup — partners stuck in draft/preview > N days.
  if (!opts.orderId) {
    for (const p of partners) {
      if (p.archivedAt || !p.isActive) continue;
      if (!["draft", "preview"].includes(p.launchStatus)) continue;
      const ageBase: Date = p.updatedAt ?? p.createdAt;
      if (ageBase >= daysAgo(staleSetupDays)) continue;
      out.push({
        key: `stale_partner_setup:${p.id}`,
        type: "stale_partner_setup",
        severity: "warning",
        title: `${p.companyName} stuck in "${p.launchStatus}" for >${staleSetupDays}d`,
        detail: "Onboarding has not progressed — review setup or archive.",
        partnerId: p.id, partnerName: p.companyName,
        orderId: null, assetId: null,
        link: `/admin/partners/${p.id}`,
        occurredAt: ageBase,
      });
    }
  }

  // ---- 6. missing_contact_config — partners with no working email routing.
  // Reuses the same logic as Section 31's email readiness page.
  if (!opts.orderId && allPartnerIds.length > 0) {
    const recipientCounts = await db.select({
      partnerId: partnerEmailRecipientsTable.partnerId,
      count: sql<number>`count(*)::int`,
    }).from(partnerEmailRecipientsTable)
      .where(inArray(partnerEmailRecipientsTable.partnerId, allPartnerIds))
      .groupBy(partnerEmailRecipientsTable.partnerId);
    const recipientCountMap = new Map(recipientCounts.map(r => [r.partnerId, Number(r.count)]));

    for (const p of partners) {
      if (p.archivedAt || !p.isActive) continue;
      const { missing } = emailConfigStatus(p);
      const recipientCount = recipientCountMap.get(p.id) ?? 0;
      const hasRouting = !!p.internalForwardEmail || !!p.routingEmail || recipientCount > 0;
      if (!hasRouting || missing.length > 0) {
        const detailParts: string[] = [];
        if (!hasRouting) detailParts.push("no internal forward / recipients");
        if (missing.length > 0) detailParts.push(`missing: ${missing.join(", ")}`);
        out.push({
          key: `missing_contact_config:${p.id}`,
          type: "missing_contact_config",
          severity: !hasRouting ? "critical" : "warning",
          title: `${p.companyName}: email routing not fully configured`,
          detail: detailParts.join(" · "),
          partnerId: p.id, partnerName: p.companyName,
          orderId: null, assetId: null,
          link: `/admin/email-readiness`,
          occurredAt: p.updatedAt ?? p.createdAt,
        });
      }
    }
  }

  // ---- 7. asset_issue — current assets explicitly rejected.
  {
    const where: any[] = [
      eq(assetsTable.isCurrent, true),
      eq(assetsTable.approvalStatus, "rejected"),
    ];
    if (opts.partnerId) where.push(eq(assetsTable.partnerId, opts.partnerId));
    if (opts.orderId) where.push(eq(assetsTable.orderId, opts.orderId));
    const rejected = await db.select({
      id: assetsTable.id,
      partnerId: assetsTable.partnerId,
      orderId: assetsTable.orderId,
      notes: assetsTable.notes,
      updatedAt: assetsTable.updatedAt,
    }).from(assetsTable).where(and(...where) as any).limit(200);
    for (const a of rejected) {
      out.push({
        key: `asset_issue:${a.id}`,
        type: "asset_issue",
        severity: "warning",
        title: `Asset #${a.id} rejected`,
        detail: a.notes ? String(a.notes).slice(0, 240) : "Approval status: rejected",
        partnerId: a.partnerId,
        partnerName: partnerName(a.partnerId),
        orderId: a.orderId,
        assetId: a.id,
        link: a.orderId ? `/admin/orders/${a.orderId}` : a.partnerId ? `/admin/partners/${a.partnerId}` : null,
        occurredAt: a.updatedAt,
      });
    }
  }

  // ---- 8. unresolved_support_issue — derived from usage_events of type
  // "support.issue_submitted" without a matching "support.issue_resolved".
  if (!opts.orderId) {
    const submitted = await db.select({
      id: usageEvents.id,
      partnerId: usageEvents.partnerId,
      objectId: usageEvents.objectId,
      meta: usageEvents.meta,
      createdAt: usageEvents.createdAt,
    }).from(usageEvents).where(and(
      eq(usageEvents.eventType, "support.issue_submitted"),
      opts.partnerId ? eq(usageEvents.partnerId, opts.partnerId) : (sql`1=1` as any),
    ) as any).orderBy(desc(usageEvents.createdAt)).limit(200);

    if (submitted.length > 0) {
      const issueIds = submitted.map(s => (s.meta as any)?.issueId).filter(Boolean) as string[];
      const resolved = issueIds.length > 0 ? await db.select({ meta: usageEvents.meta }).from(usageEvents).where(eq(usageEvents.eventType, "support.issue_resolved")) : [];
      const resolvedSet = new Set(resolved.map(r => (r.meta as any)?.issueId).filter(Boolean));

      for (const s of submitted) {
        const issueId = (s.meta as any)?.issueId;
        if (issueId && resolvedSet.has(issueId)) continue;
        const subject = (s.meta as any)?.subject || "Support issue submitted";
        out.push({
          key: `unresolved_support_issue:${s.id}`,
          type: "unresolved_support_issue",
          severity: ((s.meta as any)?.severity === "critical" ? "critical" : "warning"),
          title: `Support issue: ${subject}`,
          detail: ((s.meta as any)?.body || "").toString().slice(0, 240) || "Awaiting follow-up",
          partnerId: s.partnerId,
          partnerName: partnerName(s.partnerId),
          orderId: null, assetId: null,
          link: s.partnerId ? `/admin/partners/${s.partnerId}` : `/admin/alerts`,
          occurredAt: s.createdAt,
          meta: { issueId, channel: (s.meta as any)?.channel },
        });
      }
    }
  }

  // ---- 9. manual_followup — explicit admin-created follow-up flags
  // (events of type "alert.manual_followup"). Lets ops drop a sticky reminder
  // that survives across sessions without inventing yet another table.
  if (!opts.orderId) {
    const followups = await db.select({
      id: usageEvents.id,
      partnerId: usageEvents.partnerId,
      objectType: usageEvents.objectType,
      objectId: usageEvents.objectId,
      meta: usageEvents.meta,
      createdAt: usageEvents.createdAt,
    }).from(usageEvents).where(and(
      eq(usageEvents.eventType, "alert.manual_followup"),
      opts.partnerId ? eq(usageEvents.partnerId, opts.partnerId) : (sql`1=1` as any),
    ) as any).orderBy(desc(usageEvents.createdAt)).limit(100);
    for (const f of followups) {
      if ((f.meta as any)?.resolved) continue;
      out.push({
        key: `manual_followup:${f.id}`,
        type: "manual_followup",
        severity: "info",
        title: ((f.meta as any)?.title || "Follow-up needed").toString(),
        detail: ((f.meta as any)?.note || "").toString().slice(0, 240),
        partnerId: f.partnerId,
        partnerName: partnerName(f.partnerId),
        orderId: f.objectType === "order" ? f.objectId : null,
        assetId: null,
        link: f.objectType === "order" && f.objectId ? `/admin/orders/${f.objectId}` : (f.partnerId ? `/admin/partners/${f.partnerId}` : null),
        occurredAt: f.createdAt,
      });
    }
  }

  // Sort: critical → warning → info, then most-recent first.
  const sevRank: Record<AlertSeverity, number> = { critical: 0, warning: 1, info: 2 };
  out.sort((a, b) => sevRank[a.severity] - sevRank[b.severity] || (b.occurredAt?.getTime?.() ?? 0) - (a.occurredAt?.getTime?.() ?? 0));
  return out;
}

export interface AlertSummary {
  total: number;
  bySeverity: Record<AlertSeverity, number>;
  byType: Record<AlertType, number>;
}

export function summarizeAlerts(alerts: Alert[]): AlertSummary {
  const bySeverity: Record<AlertSeverity, number> = { critical: 0, warning: 0, info: 0 };
  const byType: Record<AlertType, number> = {
    failed_email: 0, missing_artwork: 0, order_exception: 0, inactive_partner: 0,
    stale_partner_setup: 0, unresolved_support_issue: 0, missing_contact_config: 0,
    asset_issue: 0, manual_followup: 0,
  };
  for (const a of alerts) {
    bySeverity[a.severity]++;
    byType[a.type]++;
  }
  return { total: alerts.length, bySeverity, byType };
}

// Future text-to-phone routing path. Intentionally a no-op for this pass — the
// surface exists so other code (alerts route, support intake) can call it
// without conditionals, and we only need to swap the body when SMS provider is
// connected. Logs to usage_events so we can later audit what *would* have been
// SMS'd while the path was inert.
export async function routeAlertToSms(alert: Alert, opts: { recipient?: string; reason?: string } = {}): Promise<{ delivered: boolean; reason: string }> {
  await db.insert(usageEvents).values({
    eventType: "alert.sms_route_attempt",
    partnerId: alert.partnerId,
    objectType: alert.orderId ? "order" : (alert.assetId ? "asset" : null),
    objectId: alert.orderId ?? alert.assetId ?? null,
    meta: {
      alertKey: alert.key,
      alertType: alert.type,
      severity: alert.severity,
      title: alert.title,
      recipient: opts.recipient,
      reason: opts.reason,
      routed: false,
      note: "sms provider not configured — alert recorded for future routing",
    } as any,
  });
  return { delivered: false, reason: "sms_provider_not_configured" };
}
