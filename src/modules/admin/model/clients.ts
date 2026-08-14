import { and, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { db, schema } from "@/shared/db/client";
import { PLANS, isPlanKey } from "@/modules/plans/model/plans";

/**
 * A client currently on a plan, and the money behind it.
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
  /** The tier they hold. */
  planKey: string;
  /** Σ of every deposit row whose money we still have, USD cents. */
  heldCents: number;
  /** What that tier's deposit is in the catalogue today. */
  tierDepositCents: number;
  /**
   * We hold less than the tier costs.
   *
   * The one number on this screen worth acting on. Bid Limits on the broker
   * platform are set from the deposit, so a client whose held balance no
   * longer covers their tier can bid against money that isn't there — and the
   * gap only ever appears silently, through an admin override or a
   * part-refund.
   */
  underfunded: boolean;
  /** They have asked for it back; nothing has moved yet. */
  refundPending: boolean;
  /** How many deposit rows make up the balance — 2+ means they upgraded. */
  depositCount: number;
  /** The most recent confirmation, i.e. when the current balance completed. */
  confirmedAt: Date | null;
}

/**
 * Everyone with an active plan, most recently confirmed first.
 *
 * One query, grouped in JS rather than with a window function: at this scale
 * (tens of clients) the difference is unmeasurable, and the SQL stays
 * something the next person can read. If this ever returns thousands of rows,
 * that is the moment for an aggregate — not before.
 *
 * **A LEFT join, and that matters.** It used to be an inner join on a
 * confirmed deposit, which was safe only while a confirmed deposit was the
 * sole way to get a plan. An admin override sets a tier without writing a
 * deposit row, so an inner join would drop exactly the people most worth
 * looking at — someone on Platinum holding nothing — recreating the blind
 * spot this file was written to close.
 *
 * ✅ The gap recorded here (refunding one row stripped a plan another row was
 * still paying for) is fixed: `refundClient` is scoped to the client and moves
 * every held row together, so there is no longer a single row to target.
 */
export async function activeClients(): Promise<ClientRow[]> {
  const rows = await db()
    .select({
      userId: schema.users.id,
      name: schema.users.name,
      email: schema.users.email,
      planKey: schema.users.activePlanKey,
      status: schema.deposits.status,
      amountCents: schema.deposits.amountCents,
      confirmedAt: schema.deposits.reviewedAt,
    })
    .from(schema.users)
    .leftJoin(
      schema.deposits,
      and(
        eq(schema.deposits.userId, schema.users.id),
        inArray(schema.deposits.status, ["confirmed", "refund_requested"])
      )
    )
    .where(
      and(
        isNotNull(schema.users.activePlanKey),
        // Erasure clears activePlanKey, so this should never match a deleted
        // account. Stated anyway: this list drives a refund button, and an
        // erased person must not appear on a screen offering actions on them.
        isNull(schema.users.deletedAt)
      )
    );

  const byUser = new Map<string, ClientRow>();
  for (const row of rows) {
    const planKey = row.planKey ?? "";
    let entry = byUser.get(row.userId);
    if (!entry) {
      entry = {
        userId: row.userId,
        name: row.name,
        email: row.email,
        planKey,
        heldCents: 0,
        tierDepositCents: isPlanKey(planKey) ? PLANS[planKey].depositUsdCents : 0,
        underfunded: false,
        refundPending: false,
        depositCount: 0,
        confirmedAt: null,
      };
      byUser.set(row.userId, entry);
    }
    // Null on the outer side of the join: a plan held with no deposit row at
    // all, which is precisely the case the left join exists to keep visible.
    if (row.amountCents == null) continue;
    entry.heldCents += row.amountCents;
    entry.depositCount += 1;
    if (row.status === "refund_requested") entry.refundPending = true;
    if (row.confirmedAt && (!entry.confirmedAt || row.confirmedAt > entry.confirmedAt)) {
      entry.confirmedAt = row.confirmedAt;
    }
  }

  const clients = [...byUser.values()];
  for (const client of clients) {
    client.underfunded = client.heldCents < client.tierDepositCents;
  }
  // Newest arrangements first. A client with no confirmation date at all
  // (granted by override, never funded) sorts to the top, which is where an
  // unfunded plan belongs — subtracting two sentinels would give NaN, so the
  // undated case is answered before any arithmetic happens.
  return clients.sort((a, b) => {
    if (!a.confirmedAt && !b.confirmedAt) return 0;
    if (!a.confirmedAt) return -1;
    if (!b.confirmedAt) return 1;
    return b.confirmedAt.getTime() - a.confirmedAt.getTime();
  });
}
