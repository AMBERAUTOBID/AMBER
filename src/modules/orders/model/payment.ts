/**
 * When a client's payment is due, and whether it has arrived.
 *
 * ── WHY 24 HOURS, WHEN THE AUCTIONS ALLOW MORE ──────────────────────────
 * Checked against the auctions' own published rules 2026-08-15: IAA gives
 * three business days (sale day plus two), **Copart gives two**. So the real
 * ceiling is two business days, and it belongs to Copart.
 *
 * We do not pass that ceiling on to the client, because their money has to
 * arrive before ours can leave. A transfer that departs on the auction's
 * deadline lands after it, so handing the client the full two days would leave
 * nothing for the banking system to spend. Twenty-four hours from the win
 * leaves a day of margin, and that day is the difference between a nuisance
 * and a late fee with daily storage on top.
 *
 * ⚠️ **Whose money buys the day changed on 2026-08-17, and the number did not.**
 * The original reasoning here was that *we* pay the auction and the client
 * reimburses us, so the margin was ours to spend. The owner has since confirmed
 * that we only front the money for a client we already know — two or more cars
 * bought with us — and never for a first-time buyer. So for most orders the
 * margin is the client's, the auction's late charges land on THEIR invoice
 * (`late_fee`), and the express-transfer instruction on the payment panel
 * stopped being advice and became the thing that makes this deadline possible.
 *
 * It remains a commercial judgement, not a fact, and is deliberately the only
 * number here so the owner can move it. Set by the owner 2026-08-15.
 *
 * ── AND WHY THE CLOCK STARTS AT THE WIN, NOT THE INVOICE ────────────────
 * US sales run 16:00–01:00 Lithuanian time, so a lot won at 23:40 is invoiced
 * while the client sleeps. Starting the clock at the sale keeps the deadline a
 * fact about the auction — the same instant BidManager and the auction's own
 * invoice count from — rather than something that moves with how quickly an
 * admin got to the paperwork.
 */
export const PAYMENT_DUE_HOURS = 24;

/**
 * How much a payment may fall short before we stop calling it short.
 *
 * International wires are shaved by intermediary banks: send $15,800 under the
 * default SHA charge option and $15,755 can arrive. The payment instructions
 * ask the sender to use OUR — where the sender covers every bank's fee — which
 * removes most of it, but not all, and not from a bank that ignores the flag.
 *
 * Without a tolerance an admin chases $30 differences on every single order and
 * `settled` never goes true, so the deposit-return rule (which refuses while any
 * order is open) would jam permanently on rounding. $30 is roughly one
 * intermediary's cut; a real underpayment is never this small.
 */
export const SHORT_PAYMENT_TOLERANCE_CENTS = 3000;

/** Hours left when the client is warned rather than merely informed. */
export const URGENT_WITHIN_HOURS = 6;

export type PaymentState =
  /**
   * No cost lines yet, so there is nothing to ask for.
   *
   * ⚠️ NOT the same as settled, and conflating them is the obvious mistake:
   * a freshly opened case file has a zero balance for the same arithmetic
   * reason a paid one does, and telling a client "paid in full" before anyone
   * has priced their car is a claim we would have to take back. `orderMoney()`
   * draws the same distinction — its `settled` requires `costLines.length > 0`.
   */
  | "awaiting_costs"
  /**
   * Costs exist but no balance can be computed, because the file holds both
   * currencies and no rate has been frozen. `orderMoney()` returns null there
   * rather than a confident partial sum.
   *
   * ⚠️ **Its own state because the obvious reading of null is catastrophic.**
   * Treating "unknown" as zero made this report `settled` — the page told a
   * client their car was paid for while an unpriced euro column sat next to
   * it, and the admin money list, which lists what is owed, would have left
   * the order out entirely. Neither screen may claim anything about the money
   * here; both must say the figure is not final yet.
   *
   * To the client this is indistinguishable from `awaiting_costs` and is shown
   * with the same words. To an admin it is different and actionable: the costs
   * are entered, the exchange rate is not.
   */
  | "needs_rate"
  /** Paid in full, or short by less than the tolerance. */
  | "settled"
  /** Owed, with time in hand. */
  | "due"
  /** Owed, and the deadline is close enough to say so loudly. */
  | "urgent"
  /** The deadline has passed and money is still outstanding. */
  | "overdue"
  /** Owed, but no sale time is recorded, so no deadline can be claimed. */
  | "undated";

export interface PaymentStatus {
  state: PaymentState;
  /** When the money is due. Null when the sale instant is unknown. */
  dueAt: Date | null;
  /** Hours remaining; negative once past. Null when there is no deadline. */
  hoursLeft: number | null;
  /** What is still owed, in cents. Never negative. */
  outstandingCents: number;
  /** True when something was paid but a little went missing in transit. */
  shortfallForgiven: boolean;
}

/**
 * The moment payment is due.
 *
 * `soldAt` null means the order has no recorded sale instant — a case file
 * opened by hand before the auction data arrived. **Treated as no deadline
 * rather than as immediately overdue**: we cannot tell somebody they are late
 * against a time we never recorded, and an invented deadline would drive a
 * dunning email at a client who has done nothing wrong.
 */
export function paymentDueAt(soldAt: Date | null | undefined): Date | null {
  if (!soldAt) return null;
  return new Date(soldAt.getTime() + PAYMENT_DUE_HOURS * 3_600_000);
}

/**
 * Where an order stands on money.
 *
 * `balanceCents` is what `orderMoney()` computed — cost lines minus payments,
 * in the order's own currency. `paymentsMade` gates the tolerance: an order
 * with a $25 balance and nothing paid is a $25 invoice, not a rounding error,
 * and forgiving it would mark it settled before anyone had sent a cent.
 */
export function paymentStatus(
  input: {
    soldAt: Date | null | undefined;
    balanceCents: number | null;
    paymentsMade: number;
    /** How many cost lines exist. Zero means the car has not been priced yet. */
    costLineCount: number;
  },
  now: Date
): PaymentStatus {
  const outstanding = Math.max(0, input.balanceCents ?? 0);

  if (input.costLineCount === 0 || input.balanceCents === null) {
    return {
      // Both mean "no figure to ask for yet", and both keep the deadline: it
      // is a fact about the auction, and a client whose car is still being
      // priced should still be able to see when the money will be wanted.
      state: input.costLineCount === 0 ? "awaiting_costs" : "needs_rate",
      dueAt: paymentDueAt(input.soldAt),
      hoursLeft: null,
      outstandingCents: 0,
      shortfallForgiven: false,
    };
  }
  const forgiven =
    outstanding > 0 && input.paymentsMade > 0 && outstanding <= SHORT_PAYMENT_TOLERANCE_CENTS;

  const dueAt = paymentDueAt(input.soldAt);
  const hoursLeft = dueAt === null ? null : (dueAt.getTime() - now.getTime()) / 3_600_000;

  if (outstanding === 0 || forgiven) {
    return { state: "settled", dueAt, hoursLeft, outstandingCents: 0, shortfallForgiven: forgiven };
  }

  const base = { dueAt, hoursLeft, outstandingCents: outstanding, shortfallForgiven: false };
  if (hoursLeft === null) return { ...base, state: "undated" };
  if (hoursLeft <= 0) return { ...base, state: "overdue" };
  if (hoursLeft < URGENT_WITHIN_HOURS) return { ...base, state: "urgent" };
  return { ...base, state: "due" };
}
