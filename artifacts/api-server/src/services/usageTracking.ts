import { db, usageEvents } from "@workspace/db";
import { and, eq, gte, lte, sql, desc, count } from "drizzle-orm";

export type UsageContext = {
  partnerId?: number | null;
  userId?: string | null;
  role?: string | null;
  objectType?: string | null;
  objectId?: number | null;
  meta?: Record<string, any> | null;
};

export async function emit(eventType: string, ctx: UsageContext = {}): Promise<void> {
  try {
    await db.insert(usageEvents).values({
      eventType,
      partnerId: ctx.partnerId ?? null,
      userId: ctx.userId ?? null,
      role: ctx.role ?? null,
      objectType: ctx.objectType ?? null,
      objectId: ctx.objectId ?? null,
      meta: ctx.meta ?? null,
    });
  } catch (e) {
    console.warn("[usageTracking] emit failed", eventType, e);
  }
}

export async function emitFirst(eventType: string, ctx: UsageContext): Promise<boolean> {
  if (!ctx.partnerId) return false;
  const existing = await db.select({ id: usageEvents.id }).from(usageEvents)
    .where(and(eq(usageEvents.eventType, eventType), eq(usageEvents.partnerId, ctx.partnerId))).limit(1);
  if (existing.length > 0) return false;
  await emit(eventType, ctx);
  return true;
}

export async function firstEventAt(partnerId: number, eventType: string): Promise<Date | null> {
  const [row] = await db.select({ at: usageEvents.occurredAt }).from(usageEvents)
    .where(and(eq(usageEvents.eventType, eventType), eq(usageEvents.partnerId, partnerId)))
    .orderBy(usageEvents.occurredAt).limit(1);
  return row?.at ?? null;
}

export async function summary(filters: { partnerId?: number; role?: string; since?: Date; until?: Date } = {}) {
  const conds: any[] = [];
  if (filters.partnerId) conds.push(eq(usageEvents.partnerId, filters.partnerId));
  if (filters.role) conds.push(eq(usageEvents.role, filters.role));
  if (filters.since) conds.push(gte(usageEvents.occurredAt, filters.since));
  if (filters.until) conds.push(lte(usageEvents.occurredAt, filters.until));
  const where = conds.length ? and(...conds) : undefined;

  const byType = await db.select({
    eventType: usageEvents.eventType,
    count: count(),
  }).from(usageEvents).where(where as any).groupBy(usageEvents.eventType).orderBy(desc(count()));

  const totals = await db.select({
    totalEvents: count(),
    distinctUsers: sql<number>`count(distinct ${usageEvents.userId})::int`,
    distinctPartners: sql<number>`count(distinct ${usageEvents.partnerId})::int`,
  }).from(usageEvents).where(where as any);

  return { totals: totals[0], byType };
}

export async function timeline(limit = 100, partnerId?: number) {
  const where = partnerId ? eq(usageEvents.partnerId, partnerId) : undefined;
  return db.select().from(usageEvents).where(where as any).orderBy(desc(usageEvents.occurredAt)).limit(limit);
}
