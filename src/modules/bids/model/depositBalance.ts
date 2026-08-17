/**
 * A client's security deposit for bidding, as a **rolling balance** rather
 * than a charge per car.
 *
 * ── THE RULE, AND THE DOUBLE-CHARGE IT PREVENTS ─────────────────────────
 * Settled by the owner 2026-08-14: **a lost auction does not return the
 * deposit.** If the client asks for it back they get it within five business
 * days; if they want to keep bidding, it stays with us.
 *
 * That one decision turns the deposit from a per-car charge into a per-client
 * balance, and everything here follows from it. Without the change we would
 * double-charge: somebody who lost on an $8,000 car — holding $800 of theirs —
 * and then bids $9,000 would be asked for another $900 instead of a $100
 * top-up. They would be right to be annoyed, and right about the arithmetic.
 *
 * The subtraction is the same one `planChangeFor()` already does when a client
 * moves up a tier: **ask for the difference, never the whole figure again.**
 *
 * ── WHY THE BALANCE IS A SUM OF `received` ROWS ─────────────────────────
 * The specification is written as `Σ received − Σ returned − Σ forfeited`,
 * which is how an event ledger would express it. **`bid_requests` is not an
 * event ledger** — each row carries one current `depositStatus`, so a hold that
 * was received and later returned is no longer `received`; it is `returned`.
 * Subtracting it a second time would take the money off twice and drive the
 * balance negative.
 *
 * Against this schema the two formulations are the same statement, and only
 * this one is expressible: **money we are holding right now is exactly the rows
 * that say `received`.** `returned` (given back) and `forfeited` (spent
 * covering our loss) both mean the money is no longer ours to count — which is
 * the owner's own reasoning for forfeiture: a balance that still counted it
 * would show the client funds that no longer exist.
 *
 * No migration was ever needed for any of this: `depositStatus` already
 * enumerates `not_required · awaiting · received · returned · forfeited`.
 */

/** The columns this needs from a `bid_requests` row. Nothing else. */
export interface DepositLedgerRow {
  depositStatus: string;
  /**
   * What was asked for on that instruction. It is the received figure too —
   * there is no separate "amount received" column, and there should not be
   * one: an admin who takes a different sum edits the required figure with
   * `BidDepositOverride` **before** marking it received, so the two can never
   * disagree.
   */
  depositRequiredCents: number;
}

/**
 * What we are holding for this client's bidding, in USD cents.
 *
 * Never negative by construction — it is a sum of non-negative rows, not a
 * running total that subtractions could take past zero.
 */
export function heldForBidding(rows: DepositLedgerRow[]): number {
  return rows
    .filter((row) => row.depositStatus === "received")
    .reduce((total, row) => total + Math.max(0, row.depositRequiredCents), 0);
}

/**
 * What to ask for on a NEW instruction, given what the rule wants and what we
 * already hold.
 *
 * `max(0, …)` because a client holding more than the new car needs pays
 * nothing — the surplus stays on the balance for the car after that. It is not
 * refunded here and must not be: returning it is a separate, deliberate act
 * that the client or an admin starts, never a side effect of placing a bid.
 */
export function topUpRequired(ruleCents: number, heldCents: number): number {
  return Math.max(0, ruleCents - heldCents);
}

export interface DepositQuote {
  /** What the rule asks for this car, ignoring anything already held. */
  ruleCents: number;
  /** What we already hold for this client. */
  heldCents: number;
  /** What to actually ask for now. */
  dueCents: number;
  /** True when the balance covers this car outright and nothing is due. */
  coveredByBalance: boolean;
}

/**
 * The whole answer for one instruction, in the shape a page can render.
 *
 * `coveredByBalance` is deliberately distinct from "no deposit needed": a car
 * under the free threshold needs nothing from anybody, while this one needs a
 * hold that the client has already posted. Telling the second client "no
 * deposit required" would misdescribe their own money — they would have no way
 * to know we were still holding $800 of it.
 */
export function quoteDeposit(ruleCents: number, heldCents: number): DepositQuote {
  const dueCents = topUpRequired(ruleCents, heldCents);
  return {
    ruleCents,
    heldCents,
    dueCents,
    coveredByBalance: ruleCents > 0 && dueCents === 0,
  };
}
