/**
 * Recording what a client is interested in.
 *
 * The write side of `activity_events` — see the table's comment in schema.ts
 * for why this is a separate table from `audit_log` and not a column on it.
 *
 * Three rules hold everything here together:
 *
 * 1. **Never fatal.** Same contract as `recordAudit`. A page that fails to
 *    render because the analytics write failed would be the worst possible
 *    trade — this feature is worth strictly less than the page it observes.
 * 2. **The label is frozen at write time.** Reading a client's history must
 *    cost zero calls to Apibara, and it should say what they actually saw,
 *    not what the lot became afterwards. Same reasoning as the favourites
 *    snapshot.
 * 3. **Repeats collapse inside a window.** One row per hit would make the
 *    screen unreadable within a week; see `COLLAPSE_WINDOW_MINUTES`.
 */
import { and, desc, eq, gt, lt, sql } from "drizzle-orm";
import { db, schema } from "@/shared/db/client";
import type { ActivityKind } from "@/shared/db/schema";

/**
 * A repeat of the same thing inside this window updates the existing row
 * instead of adding one.
 *
 * Thirty minutes because it is roughly one sitting. Someone who reopens a lot
 * four times while thinking about it produces one line saying "4×", which is
 * the fact worth reading; someone who comes back the next evening produces a
 * second line, which is a *different* and equally worth-reading fact. A
 * window that never expired would flatten a fortnight of returning interest
 * into a single row with a big number on it.
 */
export const COLLAPSE_WINDOW_MINUTES = 30;

/**
 * How long browsing history is kept. Chosen by the owner 2026-08-14.
 *
 * Ninety days covers a whole purchase cycle — first look to delivered car —
 * which is the longest span over which "what were they interested in?" is
 * still a live question. It is also short enough to be defensible without
 * anyone having to argue for it, which matters because the retention rules
 * for the *rest* of the system are waiting on a lawyer and this deliberately
 * does not wait with them.
 *
 * ⚠️ This is the ONLY place the number exists. It is not restated in the
 * privacy policy translations by value — those describe it in words.
 */
export const ACTIVITY_RETENTION_DAYS = 90;

export interface ActivityInput {
  userId: string;
  kind: ActivityKind;
  /** Dedupe key, scoped per kind. Bounded before it reaches the column. */
  subjectKey: string;
  /** What to show. Frozen now; never re-resolved at read time. */
  label: string;
  detail?: Record<string, unknown>;
}

/** Column caps, applied here rather than trusted from callers. */
const MAX_SUBJECT_KEY = 200;
const MAX_LABEL = 300;

/**
 * Record one thing a client did.
 *
 * Two statements rather than one `ON CONFLICT`: the collapse is conditional on
 * *time*, and a unique index would have to be unconditional. An UPDATE guarded
 * on `lastSeenAt` inside the window, then an INSERT only if it claimed
 * nothing, expresses the actual rule — and the worst a race can produce is two
 * rows for one sitting, which is a cosmetic duplicate on an admin screen
 * rather than anything that matters.
 */
export async function recordActivity(input: ActivityInput): Promise<void> {
  const subjectKey = input.subjectKey.slice(0, MAX_SUBJECT_KEY);
  const label = input.label.slice(0, MAX_LABEL);
  if (!subjectKey || !label) return;

  try {
    const since = new Date(Date.now() - COLLAPSE_WINDOW_MINUTES * 60 * 1000);
    const bumped = await db()
      .update(schema.activityEvents)
      .set({
        count: sql`${schema.activityEvents.count} + 1`,
        lastSeenAt: new Date(),
        // Refreshed on every hit: the newest label is the one that describes
        // what they saw most recently, and a price that moved between visits
        // is worth showing as the current one.
        label,
        ...(input.detail ? { detail: input.detail } : {}),
      })
      .where(
        and(
          eq(schema.activityEvents.userId, input.userId),
          eq(schema.activityEvents.kind, input.kind),
          eq(schema.activityEvents.subjectKey, subjectKey),
          gt(schema.activityEvents.lastSeenAt, since)
        )
      )
      .returning({ id: schema.activityEvents.id });

    if (bumped[0]) return;

    await db()
      .insert(schema.activityEvents)
      .values({
        userId: input.userId,
        kind: input.kind,
        subjectKey,
        label,
        detail: input.detail ?? null,
      });
  } catch (e) {
    // Swallowed on purpose — see rule 1 above.
    console.error("[activity] failed to record", input.kind, e);
  }
}

/**
 * The label this client has already seen for a lot, from their own history.
 *
 * **This is what lets the browser report an event without being trusted to
 * name it.** The project's standing rule — the one behind `deposits.amountCents`
 * and the favourites snapshot — is that a displayed value comes from our
 * source, never from the caller; a client who could supply the label could put
 * "Ferrari — $1,000,000" into their own file. But re-fetching the lot from
 * Apibara on every click would spend quota the Telegram bot shares, on an
 * admin-only screen.
 *
 * The way out: the page that hosts those buttons has already written a
 * `lot.viewed` row with a server-fetched label. Copying it costs one indexed
 * lookup, no upstream call, and leaves nothing for the caller to forge.
 *
 * Null when there is no such row — a caller inventing a lot reference gets no
 * label rather than a made-up one.
 */
export async function labelFromHistory(
  userId: string,
  subjectKey: string
): Promise<string | null> {
  const rows = await db()
    .select({ label: schema.activityEvents.label })
    .from(schema.activityEvents)
    .where(
      and(
        eq(schema.activityEvents.userId, userId),
        eq(schema.activityEvents.subjectKey, subjectKey)
      )
    )
    .orderBy(desc(schema.activityEvents.lastSeenAt))
    .limit(1);
  return rows[0]?.label ?? null;
}

export interface ActivityRow {
  id: string;
  kind: ActivityKind;
  subjectKey: string;
  label: string;
  detail: unknown;
  count: number;
  firstSeenAt: Date;
  lastSeenAt: Date;
}

/**
 * One client's history, newest first.
 *
 * Bounded rather than "select everything and let the page cope" — the same
 * rule `listUsers` follows. The caller says what it can draw.
 */
export async function activityFor(userId: string, limit = 200): Promise<ActivityRow[]> {
  return db()
    .select({
      id: schema.activityEvents.id,
      kind: schema.activityEvents.kind,
      subjectKey: schema.activityEvents.subjectKey,
      label: schema.activityEvents.label,
      detail: schema.activityEvents.detail,
      count: schema.activityEvents.count,
      firstSeenAt: schema.activityEvents.firstSeenAt,
      lastSeenAt: schema.activityEvents.lastSeenAt,
    })
    .from(schema.activityEvents)
    .where(eq(schema.activityEvents.userId, userId))
    .orderBy(desc(schema.activityEvents.lastSeenAt))
    .limit(limit);
}

/**
 * Drops history past the retention window.
 *
 * Called from login, where `pruneStaleRateLimits` already lives — a write
 * moment that exists anyway, rather than a cron this project does not have.
 * That means retention is enforced by *somebody using the site*, which is
 * fine here: a site nobody logs into is also a site collecting nothing new.
 *
 * Never fatal, for the obvious reason: failing to purge must not stop
 * somebody logging in.
 */
export async function purgeStaleActivity(): Promise<void> {
  try {
    const cutoff = new Date(Date.now() - ACTIVITY_RETENTION_DAYS * 24 * 60 * 60 * 1000);
    await db().delete(schema.activityEvents).where(lt(schema.activityEvents.lastSeenAt, cutoff));
  } catch (e) {
    console.error("[activity] purge failed:", e);
  }
}

/** Everything we hold on one person. Erasure deletes; it does not anonymise. */
export async function deleteActivityFor(userId: string): Promise<void> {
  await db().delete(schema.activityEvents).where(eq(schema.activityEvents.userId, userId));
}
