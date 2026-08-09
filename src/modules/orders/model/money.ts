export type OrderCurrency = "USD" | "EUR";

export interface MoneyRow {
  amountCents: number;
  currency: OrderCurrency;
}

/**
 * What a case file costs, what has been paid, and what is left.
 *
 * Pure. The awkward part is not the arithmetic, it is that **a case file
 * legitimately holds both currencies**: the auction is USD while EU customs
 * and final delivery are EUR. Converting everything into one at write time
 * would destroy the figure the client's bank statement will show, so both are
 * stored as given and reconciled here.
 */

/** Micros: 0.925 EUR per USD is stored as 925000. See `vehicleOrders`. */
export const MICROS = 1_000_000;

export function usdCentsToEur(cents: number, rateMicros: number): number {
  return Math.round((cents * rateMicros) / MICROS);
}

export function eurCentsToUsd(cents: number, rateMicros: number): number {
  return Math.round((cents * MICROS) / rateMicros);
}

export interface Totals {
  /** Subtotals exactly as entered, with nothing converted. */
  usdOnly: number;
  eurOnly: number;
  /**
   * The combined figure in each currency, or **null when it cannot be
   * computed honestly** — which happens when a rate has not been set and the
   * file holds the other currency too.
   *
   * Null rather than a partial sum on purpose. A "total" that silently omitted
   * the EUR lines would be a smaller, confident, wrong number, and the client
   * would find the difference when they paid it.
   */
  totalUsd: number | null;
  totalEur: number | null;
}

function combine(rows: MoneyRow[], rateMicros: number | null): Totals {
  let usdOnly = 0;
  let eurOnly = 0;
  for (const row of rows) {
    if (row.currency === "USD") usdOnly += row.amountCents;
    else eurOnly += row.amountCents;
  }

  // With a rate, everything converts. Without one, a single-currency file is
  // still perfectly answerable — it is only the mix that needs the rate.
  if (rateMicros && rateMicros > 0) {
    return {
      usdOnly,
      eurOnly,
      totalUsd: usdOnly + eurCentsToUsd(eurOnly, rateMicros),
      totalEur: usdCentsToEur(usdOnly, rateMicros) + eurOnly,
    };
  }
  return {
    usdOnly,
    eurOnly,
    totalUsd: eurOnly === 0 ? usdOnly : null,
    totalEur: usdOnly === 0 ? eurOnly : null,
  };
}

export interface OrderMoney {
  cost: Totals;
  paid: Totals;
  /** Cost minus paid, in each currency, or null when the total is null. */
  balanceUsd: number | null;
  balanceEur: number | null;
  /** True when nothing is outstanding. False when it cannot be established. */
  settled: boolean;
}

/**
 * Everything the money panel needs, from the rows it has.
 *
 * `settled` is deliberately conservative: it is true only when a balance
 * could actually be computed and is at or below zero. A file whose rate is
 * missing reports `false` rather than guessing, because "paid in full" is a
 * statement nobody should make on incomplete information — least of all to
 * the person who would then stop paying.
 */
export function orderMoney(
  costLines: MoneyRow[],
  payments: MoneyRow[],
  rateMicros: number | null
): OrderMoney {
  const cost = combine(costLines, rateMicros);
  const paid = combine(payments, rateMicros);

  const balanceUsd =
    cost.totalUsd !== null && paid.totalUsd !== null ? cost.totalUsd - paid.totalUsd : null;
  const balanceEur =
    cost.totalEur !== null && paid.totalEur !== null ? cost.totalEur - paid.totalEur : null;

  const known = balanceUsd ?? balanceEur;
  return { cost, paid, balanceUsd, balanceEur, settled: known !== null && known <= 0 };
}

/**
 * Minor units as money, in the locale the page is being read in.
 *
 * Intl rather than a hand-rolled formatter because the separator, the symbol
 * and its position all differ between the three locales this site ships in —
 * `$1,250.00` in English and `1 250,00 $` in Lithuanian, from the same number.
 */
export function formatMoney(cents: number, currency: OrderCurrency, locale: string): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

/** The frozen rate, as a human reads it: `0.9250`. */
export function formatRate(rateMicros: number): string {
  return (rateMicros / MICROS).toFixed(4);
}
