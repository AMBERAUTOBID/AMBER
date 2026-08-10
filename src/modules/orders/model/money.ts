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
 * ⚠️ **PASS EVERY ROW, INCLUDING THE ONES THE CLIENT MAY NOT SEE.** Hiding a
 * cost line withholds the DETAIL, not the debt — see `clientCostRows`. Handing
 * this function a filtered list produces a smaller balance that looks entirely
 * correct, and the person it misleads is the one deciding whether they still
 * owe money.
 *
 * `settled` is deliberately conservative: true only when a balance could
 * actually be computed and is at or below zero, on a file that has at least
 * one cost line. A file whose rate is missing reports `false` rather than
 * guessing, because "paid in full" is a statement nobody should make on
 * incomplete information — least of all to the person who would then stop
 * paying. A file with no cost lines at all reports `false` for the same
 * reason: 0 − 0 ≤ 0 is arithmetic, not a statement about anybody's account,
 * and a brand-new case file that greets its admin with "paid in full" is
 * telling them something it cannot possibly know yet.
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
  return {
    cost,
    paid,
    balanceUsd,
    balanceEur,
    settled: costLines.length > 0 && known !== null && known <= 0,
  };
}

export interface CostLineRow extends MoneyRow {
  id: string;
  kind: string;
  label: string | null;
  visibleToClient: boolean;
}

/** A cost line as the client sees it. No `visibleToClient` — nothing here is hidden. */
export interface ClientCostRow {
  id: string;
  kind: string;
  label: string | null;
  amountCents: number;
  currency: OrderCurrency;
}

/**
 * The itemisation a client may read, with the hidden lines folded into a
 * residual rather than dropped.
 *
 * **Hiding a cost line hides what it is FOR, never that it is owed.** The
 * motive is not charging in secret — it is not itemising our margin on its
 * own line. Dropping those rows from the client's table would have made the
 * table disagree with the total underneath it, and a client who adds up an
 * invoice and gets a different number to the one they are asked to pay is
 * right to distrust everything else on the page.
 *
 * **The residual is per currency**, because a hidden USD line and a hidden
 * EUR line are not one number and merging them would need a rate this
 * function does not have — and must not guess at, since the whole point of
 * the frozen rate is that it is the one the bank actually gave us.
 *
 * The residual carries kind `other`, which already reads as "Kita" / "Other"
 * in all three languages. A file may therefore show two `other` rows, one the
 * admin typed and one summed here. That is honest: they are different money,
 * and merging them would rewrite a line somebody entered by hand.
 */
export function clientCostRows(lines: CostLineRow[]): ClientCostRow[] {
  const shown: ClientCostRow[] = [];
  let hiddenUsd = 0;
  let hiddenEur = 0;

  for (const line of lines) {
    if (line.visibleToClient) {
      shown.push({
        id: line.id,
        kind: line.kind,
        label: line.label,
        amountCents: line.amountCents,
        currency: line.currency,
      });
    } else if (line.currency === "USD") {
      hiddenUsd += line.amountCents;
    } else {
      hiddenEur += line.amountCents;
    }
  }

  // Zero is not shown. A residual of nothing is not a line, and printing
  // "Other — €0.00" invites a question with no answer behind it.
  if (hiddenUsd !== 0) {
    shown.push({ id: "hidden-usd", kind: "other", label: null, amountCents: hiddenUsd, currency: "USD" });
  }
  if (hiddenEur !== 0) {
    shown.push({ id: "hidden-eur", kind: "other", label: null, amountCents: hiddenEur, currency: "EUR" });
  }

  return shown;
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

/**
 * A typed amount, in cents — or null if it isn't one.
 *
 * This is where money bugs live, so it is deliberately strict about the one
 * thing that matters and forgiving about everything else.
 *
 * **The comma is the whole problem.** An admin working in Lithuanian types
 * `1420,50`; the same person pasting from an American invoice gets
 * `1,420.50`. Treating the comma as a decimal separator in the second case
 * gives 1.42, and treating it as a thousands separator in the first gives
 * 142050 — a hundredfold error, in a field that decides what a client owes.
 * The rule below resolves it by position rather than by locale, because the
 * page's locale says nothing about what was pasted into it.
 *
 * Returns null rather than 0 for unparseable input: zero is a real amount
 * somebody might mean, and a silent zero is worse than a rejected form.
 */
export function parseAmountToCents(input: string): number | null {
  const cleaned = input.replace(/[\s '’]/g, "").replace(/[€$]/g, "");
  if (!cleaned) return null;

  const lastComma = cleaned.lastIndexOf(",");
  const lastDot = cleaned.lastIndexOf(".");

  let normalised: string;
  if (lastComma === -1 && lastDot === -1) {
    normalised = cleaned;
  } else {
    // Whichever separator comes LAST is the decimal one — true for both
    // `1.420,50` and `1,420.50`, and for a bare `1420,50` or `1420.50`.
    const decimalAt = Math.max(lastComma, lastDot);
    const whole = cleaned.slice(0, decimalAt).replace(/[.,]/g, "");
    const fraction = cleaned.slice(decimalAt + 1);

    /**
     * EXACTLY three digits after the final separator is genuinely ambiguous —
     * `1,420` is one thousand four hundred and twenty, and `10.005` could be
     * ten and a half cents. It is resolved in favour of the thousands group,
     * because in this form the amounts are car prices, auction fees and ocean
     * freight, and **money is never entered here to three decimals**. Reading
     * `1,420` as 1.42 would understate a cost line by a factor of a thousand.
     *
     * FOUR or more is not a real amount at all — it is a paste artefact — and
     * there the decimal reading is the safe one, because stripping the
     * separator would multiply the figure instead of rounding it.
     */
    if (fraction.length === 3) normalised = cleaned.replace(/[.,]/g, "");
    else normalised = `${whole}.${fraction}`;
  }

  if (!/^-?\d*\.?\d*$/.test(normalised) || !/\d/.test(normalised)) return null;

  const value = Number(normalised);
  if (!Number.isFinite(value) || value < 0) return null;

  // Rounded, not truncated: 0.005 entered as a third decimal should not
  // silently become 0.00.
  return Math.round(value * 100);
}

/**
 * A typed exchange rate, in micros — or null.
 *
 * Bounded deliberately. A rate outside 0.1–10 is a typo (a misplaced decimal,
 * or micros pasted in by mistake), and accepting it would quietly restate
 * every euro figure on the file by a factor of ten.
 */
export function parseRateToMicros(input: string): number | null {
  const cents = parseAmountToCents(input);
  if (cents === null) return null;
  // parseAmountToCents gives hundredths; a rate needs four decimals, so read
  // the raw string once more for the precision it deserves.
  const value = Number(input.replace(/[\s ]/g, "").replace(",", "."));
  if (!Number.isFinite(value) || value < 0.1 || value > 10) return null;
  return Math.round(value * MICROS);
}
