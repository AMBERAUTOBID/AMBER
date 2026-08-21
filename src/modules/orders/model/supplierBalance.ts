/**
 * The arithmetic over the supplier ledger: balance, runway, and the guard.
 *
 * Pure, like every money module here. The rows come in, the conclusions come
 * out, and the DB half stays a dumb reader — so the warning threshold and
 * the override rule are testable without a database.
 */

export interface SupplierLedgerRow {
  kind: "top_up" | "drawdown" | "adjustment";
  direction: "credit" | "debit";
  amountCents: number;
}

/**
 * Credits minus debits. The sign lives in `direction` alone — `amountCents`
 * is stored positive by rule, but a defensive `Math.abs` means even a bad
 * row cannot flip its own meaning twice.
 */
export function supplierBalanceCents(rows: SupplierLedgerRow[]): number {
  let balance = 0;
  for (const row of rows) {
    const amount = Math.abs(row.amountCents);
    balance += row.direction === "credit" ? amount : -amount;
  }
  return balance;
}

/**
 * "Enough for about N more cars", from what cars have actually cost.
 *
 * The average is taken over the most recent drawdowns (up to five) because
 * the fleet mix drifts — the owner buying three $30k cars in a row makes an
 * old $6k average a comfortable lie. With no history yet there is nothing
 * honest to divide by, so the fallback is the one real purchase this
 * project has seen: ~$6,548, the Mercedes chain (receipt + hauling + $50).
 * A fallback is a guess; it is at least a guess with a receipt behind it.
 */
export const FALLBACK_CAR_COST_CENTS = 654_800;
const RUNWAY_SAMPLE = 5;

export function runwayCars(
  balanceCents: number,
  recentDrawdownsCents: number[]
): { cars: number; averageCents: number } {
  const sample = recentDrawdownsCents.slice(0, RUNWAY_SAMPLE).map(Math.abs).filter((c) => c > 0);
  const averageCents =
    sample.length > 0
      ? Math.round(sample.reduce((sum, c) => sum + c, 0) / sample.length)
      : FALLBACK_CAR_COST_CENTS;

  return {
    cars: balanceCents > 0 ? Math.floor(balanceCents / averageCents) : 0,
    averageCents,
  };
}

/**
 * When the money panel starts shouting.
 *
 * `low` at two cars of runway: one car is already too late — a session can
 * sell two lots to our clients in one night, and a top-up takes a business
 * day to land. `empty` speaks for itself.
 */
export type BalanceAlert = "ok" | "low" | "empty";
export const LOW_RUNWAY_CARS = 2;

export function balanceAlert(balanceCents: number, runway: number): BalanceAlert {
  if (balanceCents <= 0) return "empty";
  return runway < LOW_RUNWAY_CARS ? "low" : "ok";
}

/**
 * The guard: may this drawdown proceed without an explicit override?
 *
 * The owner's payment doctrine, set 2026-08-20, has exactly two legitimate
 * paths to our money leaving for an auction:
 *
 *  1. **A repeat client** — somebody with a previous case file. We pay from
 *     the balance the moment they win, invoice going out simultaneously.
 *     No ceremony: financing the trusted is the point of the balance.
 *  2. **A first-timer who has shown their bank's payment confirmation** —
 *     invoice issued, and the client pressed "I have sent the transfer"
 *     (the `order.payment_declared` signal, built for exactly this). We do
 *     NOT wait for the wire to land — 1–6 days would eat the auction's
 *     whole window; the confirmation is the point of trust.
 *
 * A settled file passes trivially. Everything else — a first-timer with no
 * invoice, no declaration, or a drawdown naming no case file at all — gets
 * the amber box and needs a written reason. The friction that used to be
 * "wiring real money hurts" lives here now.
 *
 * Top-ups and adjustments never need overrides: they are the relationship's
 * money, not a car's.
 */
export interface DrawdownFacts {
  kind: "top_up" | "drawdown" | "adjustment";
  /** `orderMoney().settled` — the same fact every other screen shows. */
  clientSettled: boolean | null;
  /** The client has at least one OTHER case file with us. */
  repeatClient: boolean;
  /** An `order_invoices` row exists for this file. */
  invoiceIssued: boolean;
  /** The client pressed "I have sent the transfer" on this file. */
  paymentDeclared: boolean;
}

export function drawdownNeedsOverride(input: DrawdownFacts): boolean {
  if (input.kind !== "drawdown") return false;
  if (input.repeatClient) return false;
  if (input.clientSettled === true) return false;
  if (input.invoiceIssued && input.paymentDeclared) return false;
  return true;
}
