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
import { sql } from "drizzle-orm";
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
  /** Keyed by user id. Refreshing a saved car is the only action a client can
   * take that spends Apibara quota on demand, and that quota is shared with
   * the Telegram bot — which posts on a schedule and cannot back off. Sixty
   * an hour is far more than reading a list needs and far less than a held-
   * down button would manage. */
  favoriteRefreshPerUser: { max: 60, windowSeconds: 60 * 60 },
} as const satisfies Record<string, LimitRule>;

export type LimitName = keyof typeof LIMITS;

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
