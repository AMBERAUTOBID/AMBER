/**
 * Fixed-window rate limiting backed by the rate_limits table.
 *
 * A table, not Redis, on purpose (see schema.ts): auth endpoints see a few
 * requests per minute at this project's scale, and a second datastore is not
 * worth provisioning to count them. The window algorithm is the simple one —
 * count per (key, window) with the window stamped on the row — because
 * precision doesn't matter here; keeping a credential-stuffing script from
 * making thousands of attempts does.
 *
 * Fail-open by choice: if the database is unreachable, auth itself will fail
 * anyway, so throwing here would only replace one error with a less accurate
 * one.
 */
import { lt, sql } from "drizzle-orm";
import { db, schema } from "@/shared/db/client";

interface LimitRule {
  /** Attempts allowed per window. */
  max: number;
  windowSeconds: number;
}

/**
 * One place to see every limit. Keys are "<rule>:<subject>", subject being
 * an IP or a normalized email — both are limited so that neither a single
 * IP hammering many accounts nor many IPs hammering one account slips by.
 */
export const LIMITS = {
  loginPerIp: { max: 20, windowSeconds: 15 * 60 },
  loginPerEmail: { max: 10, windowSeconds: 15 * 60 },
  registerPerIp: { max: 5, windowSeconds: 60 * 60 },
  resetPerEmail: { max: 3, windowSeconds: 60 * 60 },
  /** Keyed by user id. Changing your password verifies the current one, which
   * makes that endpoint an oracle for guessing it — someone who borrows an
   * unlocked laptop gets ten tries, not unlimited. Separate from
   * loginPerEmail so failures here can't lock the owner out of logging in. */
  passwordChangePerUser: { max: 10, windowSeconds: 15 * 60 },
  /** The maintenance switch verifies the admin's password, so it is the same
   * kind of oracle the password-change endpoint is — and it takes the whole
   * site up or down, which nobody needs to do ten times in a quarter hour
   * unless something is wrong. */
  maintenanceTogglePerUser: { max: 10, windowSeconds: 15 * 60 },
  contactPerIp: { max: 10, windowSeconds: 60 * 60 },
  /** Keyed by user id. Refresh and save are the two actions that spend
   * Apibara quota on demand — quota shared with the Telegram bot, which
   * posts on a schedule and cannot back off. Sixty an hour is far more than
   * a person needs and far less than a script would want (save was
   * unmetered until the 2026-08-06 audit). */
  favoriteRefreshPerUser: { max: 60, windowSeconds: 60 * 60 },
  favoriteSavePerUser: { max: 60, windowSeconds: 60 * 60 },
  /** A cancel→re-request loop used to email the admin and the client on
   * every cycle, unmetered (2026-08-06 audit). Five an hour is generous for
   * a person deciding on a plan and useless for spamming an inbox. */
  planRequestPerUser: { max: 5, windowSeconds: 60 * 60 },
} as const satisfies Record<string, LimitRule>;

export type LimitName = keyof typeof LIMITS;

/**
 * Deletes counters whose window lapsed more than a day ago. Called from
 * login (a write moment that already exists — the same home as
 * pruneExpiredSessions) rather than a cron the project doesn't need.
 *
 * Exists because nothing else ever deleted these rows (2026-08-06 audit):
 * every IP that ever touched a limited endpoint left one behind forever,
 * which is invisible at ten users and a bloated, unindexed-scan liability
 * after a year of real traffic and scanner noise.
 */
export async function pruneStaleRateLimits(): Promise<void> {
  try {
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    await db().delete(schema.rateLimits).where(lt(schema.rateLimits.windowStartedAt, dayAgo));
  } catch (e) {
    console.error("[rateLimit] prune failed:", e);
  }
}

/** True = allowed. False = over the limit, caller should refuse. */
export async function consumeLimit(name: LimitName, subject: string): Promise<boolean> {
  const rule = LIMITS[name];
  const key = `${name}:${subject.toLowerCase().slice(0, 200)}`;
  const windowStart = new Date(Date.now() - rule.windowSeconds * 1000);

  try {
    // One round trip: reset the row if its window lapsed, else increment,
    // and read the resulting count. Upsert keeps first-attempt races benign.
    const rows = await db()
      .insert(schema.rateLimits)
      .values({ key, count: 1 })
      .onConflictDoUpdate({
        target: schema.rateLimits.key,
        set: {
          count: sql`case when ${schema.rateLimits.windowStartedAt} < ${windowStart} then 1 else ${schema.rateLimits.count} + 1 end`,
          windowStartedAt: sql`case when ${schema.rateLimits.windowStartedAt} < ${windowStart} then now() else ${schema.rateLimits.windowStartedAt} end`,
        },
      })
      .returning({ count: schema.rateLimits.count });
    return (rows[0]?.count ?? 1) <= rule.max;
  } catch (e) {
    console.error("[rateLimit] check failed, allowing request:", e);
    return true;
  }
}
