import { db, partnersTable, usageEvents, workflowTasksTable, workflowAlertsTable } from "@workspace/db";
import { and, eq, ne, count } from "drizzle-orm";
import { readinessForPartner } from "./launchReadiness";
import { firstEventAt } from "./usageTracking";

export type HealthStatus = "not_started" | "onboarding" | "live_fragile" | "active" | "healthy" | "at_risk";
export type HealthSignal = { key: string; label: string; value?: any; impact?: number };

const DAY = 24 * 60 * 60 * 1000;

export async function computePartnerHealth(partnerId: number) {
  const [partner] = await db.select().from(partnersTable).where(eq(partnersTable.id, partnerId));
  if (!partner) return null;

  const readiness = await readinessForPartner(partnerId);
  const launchStatus = (partner.launchStatus as string) || "draft";

  const firstEvent = await firstEventAt(partnerId, "first_event_created");
  const firstOrder = await firstEventAt(partnerId, "first_order_submitted");
  const launchedAt = partner.launchedAt;

  const [openTasks] = await db.select({ c: count() }).from(workflowTasksTable)
    .where(and(eq(workflowTasksTable.partnerId, partnerId), ne(workflowTasksTable.status, "completed")));
  const [unresolvedAlerts] = await db.select({ c: count() }).from(workflowAlertsTable)
    .where(and(eq(workflowAlertsTable.partnerId, partnerId), eq(workflowAlertsTable.isResolved, false)));
  const [recentEventCount] = await db.select({ c: count() }).from(usageEvents)
    .where(and(eq(usageEvents.partnerId, partnerId)));

  const signals: HealthSignal[] = [];
  let score = 100;
  let status: HealthStatus = "active";

  signals.push({ key: "launch_status", label: `Launch: ${launchStatus}`, value: launchStatus });
  signals.push({ key: "readiness", label: `Setup ${readiness.completionPct}% complete`, value: readiness.completionPct });
  signals.push({ key: "blockers", label: `${readiness.blockerCount} blocker(s)`, value: readiness.blockerCount, impact: readiness.blockerCount * -8 });
  signals.push({ key: "open_tasks", label: `${openTasks.c} open task(s)`, value: openTasks.c, impact: -Math.min(openTasks.c * 2, 20) });
  signals.push({ key: "alerts", label: `${unresolvedAlerts.c} unresolved alert(s)`, value: unresolvedAlerts.c, impact: -Math.min(unresolvedAlerts.c * 4, 20) });
  signals.push({ key: "activity", label: `${recentEventCount.c} usage event(s)`, value: recentEventCount.c });

  score -= readiness.blockerCount * 8;
  score -= Math.min(openTasks.c * 2, 20);
  score -= Math.min(unresolvedAlerts.c * 4, 20);
  if (readiness.warningCount) score -= Math.min(readiness.warningCount * 2, 10);

  // Status determination
  if (launchStatus === "draft" && readiness.completionPct < 25) status = "not_started";
  else if (launchStatus === "draft" || launchStatus === "preview" || launchStatus === "internal_only") status = "onboarding";
  else if (launchStatus === "paused") status = "at_risk";
  else if (launchStatus === "live") {
    if (readiness.blockerCount > 0 || unresolvedAlerts.c > 2) status = "live_fragile";
    else if (firstOrder && score >= 85) status = "healthy";
    else if (score < 60) status = "at_risk";
    else status = "active";
  }

  // staleness — live but no recent activity drops to at_risk
  if (status !== "not_started" && launchedAt && Date.now() - new Date(launchedAt).getTime() > 30 * DAY && !firstOrder) {
    status = "at_risk";
    signals.push({ key: "stale", label: "Launched 30+ days ago, no first order yet", impact: -15 });
    score -= 15;
  }

  const timeToFirstOrderDays = firstOrder && launchedAt
    ? Math.round((new Date(firstOrder).getTime() - new Date(launchedAt).getTime()) / DAY)
    : null;

  return {
    partnerId,
    companyName: partner.companyName,
    launchStatus,
    status,
    score: Math.max(0, Math.min(100, score)),
    signals,
    metrics: {
      readinessPct: readiness.completionPct,
      blockers: readiness.blockerCount,
      openTasks: openTasks.c,
      unresolvedAlerts: unresolvedAlerts.c,
      usageEventCount: recentEventCount.c,
      firstEventAt: firstEvent,
      firstOrderAt: firstOrder,
      launchedAt,
      timeToFirstOrderDays,
    },
  };
}

export async function listAllPartnerHealth() {
  const all = await db.select({ id: partnersTable.id }).from(partnersTable);
  const results: any[] = [];
  for (const { id } of all) {
    const h = await computePartnerHealth(id);
    if (h) results.push(h);
  }
  return results;
}
