import { and, desc, eq, isNotNull, isNull } from "drizzle-orm";
import { db, schema } from "@/shared/db/client";

/**
 * A client currently on a plan, with the deposit that bought it.
 *
 * This exists because of a real blind spot: the deposit queue lists only
 * *pending* requests, so the moment an admin pressed Confirm the client
 * vanished from every screen in the application. There was no list of who was
 * actually on a plan, and `refundDeposit` — written, tested and wired to an
 * API route — had no button anywhere that called it.
 */
export interface ClientRow {
  userId: string;
  name: string;
  email: string;
  planKey: string;
  /** The confirmed deposit backing the plan — what a refund would target. */
  depositId: string;
  amountCents: number;
  confirmedAt: Date | null;
}

/**
 * Everyone with an active plan, most recently confirmed first.
 *
 * One query, deduplicated in JS rather than with a window function: at this
 * scale (tens of clients) the difference is unmeasurable, and the SQL stays
 * something the next person can read. If this ever returns thousands of rows,
 * that is the moment for `DISTINCT ON (user_id)` — not before.
 *
 * The deposit picked per user is the newest confirmed one, which matters on
 * the upgrade path: a client who moved from one plan to another has two
 * confirmed rows, and the refund button must target the one paying for the
 * plan they hold now.
 *
 * ⚠️ Known gap, not introduced here: `refundDeposit` clears `activePlanKey`
 * outright, so refunding an *older* confirmed deposit would strip a plan a
 * newer one is still paying for. Unreachable today — only Bronze is
 * available, so nobody can hold two — but it must be fixed before a second
 * plan opens up.
 */
export async function activeClients(): Promise<ClientRow[]> {
  const rows = await db()
    .select({
      userId: schema.users.id,
      name: schema.users.name,
      email: schema.users.email,
      planKey: schema.users.activePlanKey,
      depositId: schema.deposits.id,
      amountCents: schema.deposits.amountCents,
      confirmedAt: schema.deposits.reviewedAt,
    })
    .from(schema.users)
    .innerJoin(schema.deposits, eq(schema.deposits.userId, schema.users.id))
    .where(
      and(
        isNotNull(schema.users.activePlanKey),
        eq(schema.deposits.status, "confirmed"),
        // Erasure clears activePlanKey, so this should never match a deleted
        // account. Stated anyway: this list drives a refund button, and an
        // erased person must not appear on a screen offering actions on them.
        isNull(schema.users.deletedAt)
      )
    )
    .orderBy(desc(schema.deposits.reviewedAt));

  const seen = new Set<string>();
  const clients: ClientRow[] = [];
  for (const row of rows) {
    if (seen.has(row.userId)) continue;
    seen.add(row.userId);
    clients.push({ ...row, planKey: row.planKey ?? "" });
  }
  return clients;
}
