/**
 * Reading a Copart "Sales Receipt/Bill of Sale" into cost lines.
 *
 * ── WHY A PARSER AND NOT A FORM ─────────────────────────────────────────
 * The receipt is the document the whole chain starts from: it satisfies
 * Aivi's mandatory `Bill of sale` upload, it carries the exact sale time the
 * client's deadline runs from, and its five charge lines are the first five
 * cost lines of every case file. Before this existed an admin retyped those
 * numbers at whatever hour the car was won; a mistyped $6,223 becomes a
 * client invoice nobody can reconcile.
 *
 * ── THE GUARD IS THE POINT ──────────────────────────────────────────────
 * `matchesOrder` refuses a receipt whose lot or VIN differs from the case
 * file it is being attached to. With several clients winning in the same
 * night, "attached the right PDF to the wrong Tomas" is the mistake a human
 * at 03:00 makes and a string comparison never does.
 *
 * Pure text in, data out. The PDF→text step lives in the api layer — this
 * file must stay importable by tests and client code alike.
 */

export interface ReceiptCharge {
  /** Copart's own words — "Internet Bid Fee". Printed on our invoice as-is. */
  label: string;
  amountCents: number;
}

export interface CopartReceipt {
  lotNumber: string | null;
  vin: string | null;
  /** The sale date as printed (their yards run US time; the DAY is what the
   * deadline arithmetic needs, and inventing an hour would be fake data). */
  saleDate: Date | null;
  /** The hammer price — Copart's "Sale Price" line. */
  salePriceCents: number | null;
  /** Every other charge, in document order. */
  charges: ReceiptCharge[];
  /** Their own total, kept ONLY to cross-check ours — never booked. */
  netDueCents: number | null;
}

/** `$5,400.00` → 540000. Returns null rather than guessing at a malformed
 * amount: a money parser that shrugs is how $54.00 books as $5,400. */
function moneyToCents(raw: string): number | null {
  const match = raw.replace(/[,\s]/g, "").match(/^\$?(\d+)\.(\d{2})$/);
  if (!match) return null;
  return Number(match[1]) * 100 + Number(match[2]);
}

/** `08/17/2026` → a UTC date at midnight. */
function usDate(raw: string): Date | null {
  const match = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return null;
  const [, mm, dd, yyyy] = match;
  const date = new Date(Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd)));
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Lines whose amounts must never become a charge: the hammer is its own
 * field, and the totals row is Copart adding up — booking it would double
 * every fee on the file.
 */
const SALE_PRICE = /^sale\s+price$/i;
const TOTALS = /^net\s+due\b|^total\b|^paid\b|^balance\b/i;

/**
 * Parse the extracted text of one receipt.
 *
 * Tolerant of layout drift on purpose: fields are found by their own labels
 * (`LOT#:`, `VIN:`, `Sale:`), never by position, and a charge line is
 * "a known-shaped label followed by a dollar amount". Copart reformatting
 * their PDF should degrade this to nulls — which the caller surfaces as
 * "could not read, enter manually" — never to wrong numbers.
 */
export function parseCopartReceipt(text: string): CopartReceipt {
  const lot = text.match(/LOT\s*#?\s*:\s*(\d{6,10})/i)?.[1] ?? null;
  const vin = text.match(/VIN\s*:\s*([A-HJ-NPR-Z0-9]{11,17})/i)?.[1] ?? null;
  const saleDate = usDate(text.match(/Sale\s*:\s*(\d{2}\/\d{2}\/\d{4})/i)?.[1] ?? "") ?? null;

  let salePriceCents: number | null = null;
  let netDueCents: number | null = null;
  const charges: ReceiptCharge[] = [];

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    // "08/17/2026  Internet Bid Fee  $99.00" — date optional, label, amount.
    const match = line.match(
      /^(?:\d{2}\/\d{2}\/\d{4}\s+)?([A-Za-z][A-Za-z ()/&-]*?)\s+\(?USD\)?\s*\$?([\d,]+\.\d{2})$/
    ) ?? line.match(/^(?:\d{2}\/\d{2}\/\d{4}\s+)?([A-Za-z][A-Za-z ()/&-]*?)\s+\$([\d,]+\.\d{2})$/);
    if (!match) continue;

    const label = match[1].replace(/\s+/g, " ").trim();
    const cents = moneyToCents(match[2]);
    if (cents === null) continue;

    if (SALE_PRICE.test(label)) {
      salePriceCents = cents;
    } else if (TOTALS.test(label)) {
      if (/^net\s+due/i.test(label)) netDueCents = cents;
    } else {
      charges.push({ label, amountCents: cents });
    }
  }

  return { lotNumber: lot, vin, saleDate, salePriceCents, charges, netDueCents };
}

/** What stops a receipt being attached to the wrong car. */
export type ReceiptMismatch = "lot" | "vin" | "unreadable";

/**
 * Null when the receipt belongs to this order; otherwise what disagreed.
 *
 * A receipt with NO readable lot at all is refused as `unreadable` rather
 * than waved through — absence of evidence is not a match. The VIN check
 * only runs when both sides have one, because Copart occasionally omits it
 * and half our older orders predate VIN capture.
 */
export function matchesOrder(
  receipt: CopartReceipt,
  order: { lotNumber: string; vin: string | null }
): ReceiptMismatch | null {
  if (!receipt.lotNumber) return "unreadable";
  if (receipt.lotNumber !== order.lotNumber.trim()) return "lot";
  if (receipt.vin && order.vin && receipt.vin.toUpperCase() !== order.vin.trim().toUpperCase()) {
    return "vin";
  }
  return null;
}

/**
 * The receipt as `order_cost_lines` rows: the hammer as `auction_price`,
 * every charge as a labelled `auction_fees` line. Copart's own Net Due is
 * deliberately NOT among them — see the interface comment.
 */
export function receiptCostLines(
  receipt: CopartReceipt
): { kind: "auction_price" | "auction_fees"; label: string | null; amountCents: number }[] {
  const lines: { kind: "auction_price" | "auction_fees"; label: string | null; amountCents: number }[] =
    [];
  if (receipt.salePriceCents !== null) {
    lines.push({ kind: "auction_price", label: null, amountCents: receipt.salePriceCents });
  }
  for (const charge of receipt.charges) {
    lines.push({ kind: "auction_fees", label: charge.label, amountCents: charge.amountCents });
  }
  return lines;
}

/** True when Copart's own total equals hammer + charges — the cross-check
 * that catches a line the parser missed. */
export function reconciles(receipt: CopartReceipt): boolean {
  if (receipt.netDueCents === null || receipt.salePriceCents === null) return false;
  const sum =
    receipt.salePriceCents + receipt.charges.reduce((total, c) => total + c.amountCents, 0);
  return sum === receipt.netDueCents;
}
