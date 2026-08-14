/**
 * One client's history, from both tables, as a single list.
 *
 * The two-table split (see `activity_events` in schema.ts) is a storage
 * decision, not a presentation one: an admin asking "what has this person been
 * doing?" wants the lot they opened and the password they changed on the same
 * timeline, in order. This is where the split stops being visible.
 *
 * The merge is a pure function over two arrays so the ordering — the only part
 * that can be subtly wrong — is testable without a database.
 */
import { desc, eq, or } from "drizzle-orm";
import { db, schema } from "@/shared/db/client";
import { activityFor, type ActivityRow } from "./events";

export interface AuditRow {
  id: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  detail: unknown;
  createdAt: Date;
  /** Somebody else did this to them — an admin override, a refund. */
  byOther: boolean;
}

export interface TimelineEntry {
  id: string;
  /** When it last happened. The list is ordered on this. */
  at: Date;
  /** Only when it happened more than once; null otherwise. */
  firstAt: Date | null;
  source: "activity" | "audit";
  /** An ActivityKind, or an audit action like `auth.login`. */
  kind: string;
  /** The subject — a car, a search. Empty for events that are their own. */
  label: string;
  /** Hits collapsed into this entry. Always 1 for audit rows. */
  count: number;
  detail: unknown;
  /** An action taken BY staff, not by the client. Worth marking on screen. */
  byOther: boolean;
}

/**
 * Newest first.
 *
 * Ties are broken by id rather than left to the sort's discretion: two events
 * can share a timestamp to the millisecond (a login and the session write
 * behind it), and an unstable order there makes the screen shuffle between
 * reloads for no reason a reader could explain.
 */
export function mergeTimeline(activity: ActivityRow[], audit: AuditRow[]): TimelineEntry[] {
  const entries: TimelineEntry[] = [
    ...activity.map((row) => ({
      id: row.id,
      at: row.lastSeenAt,
      // Carried only when it adds something. first === last on a single hit,
      // and printing a range that is one instant wide reads as a bug.
      firstAt: row.count > 1 ? row.firstSeenAt : null,
      source: "activity" as const,
      kind: row.kind as string,
      label: row.label,
      count: row.count,
      detail: row.detail,
      byOther: false,
    })),
    ...audit.map((row) => ({
      id: row.id,
      at: row.createdAt,
      firstAt: null,
      source: "audit" as const,
      kind: row.action,
      label: "",
      count: 1,
      detail: row.detail,
      byOther: row.byOther,
    })),
  ];

  return entries.sort((a, b) => {
    const byTime = b.at.getTime() - a.at.getTime();
    return byTime !== 0 ? byTime : a.id.localeCompare(b.id);
  });
}

/**
 * Everything `audit_log` holds about one person, in both directions.
 *
 * **Both directions matter and only one is obvious.** `actorId` is what they
 * did; `targetId` is what was done to them — an admin moving their tier, a
 * refund being paid. A timeline built on `actorId` alone would show a client's
 * plan changing with nothing on screen explaining who changed it, which is
 * exactly the question the override warning was built to make answerable.
 */
export async function auditFor(userId: string, limit = 200): Promise<AuditRow[]> {
  const rows = await db()
    .select({
      id: schema.auditLog.id,
      actorId: schema.auditLog.actorId,
      action: schema.auditLog.action,
      targetType: schema.auditLog.targetType,
      targetId: schema.auditLog.targetId,
      detail: schema.auditLog.detail,
      createdAt: schema.auditLog.createdAt,
    })
    .from(schema.auditLog)
    .where(or(eq(schema.auditLog.actorId, userId), eq(schema.auditLog.targetId, userId)))
    .orderBy(desc(schema.auditLog.createdAt))
    .limit(limit);

  return rows.map((row) => ({
    id: row.id,
    action: row.action,
    targetType: row.targetType,
    targetId: row.targetId,
    detail: row.detail,
    createdAt: row.createdAt,
    byOther: row.actorId !== userId,
  }));
}

/** The whole history for one client, ready to draw. */
export async function timelineFor(userId: string, limit = 200): Promise<TimelineEntry[]> {
  const [activity, audit] = await Promise.all([
    activityFor(userId, limit),
    auditFor(userId, limit),
  ]);
  return mergeTimeline(activity, audit).slice(0, limit);
}
