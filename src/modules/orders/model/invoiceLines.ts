import type { ClientCostRow, OrderCurrency } from "./money";

/**
 * Cost lines folded into the shape an invoice prints.
 *
 * ── WHY THIS IS NOT `clientCostRows` ────────────────────────────────────
 * The order page lists every cost line as its own row, which is right for a
 * screen: it mirrors what an admin typed, and an admin who entered two lines
 * wants to see two lines. An invoice is a different document with a different
 * reader. A client comparing our figure against what they saw in BidManager
 * needs one heading per *kind of cost* with the detail underneath it, because
 * the question they are actually asking is "the auction said $5,400, why am I
 * being asked for $8,048" — and that is answered by grouping, not by listing.
 *
 * ── THE ONE RULE WORTH REMEMBERING ──────────────────────────────────────
 * **A breakdown is printed only when it adds up to its own heading.** Copart
 * bills the hammer price and four separate fees; an admin enters those four
 * as labelled `auction_fees` lines, and the invoice prints them indented
 * under one "Auction fees" total. But if somebody later adds a fifth
 * `auction_fees` line and forgets to label it, the four parts would sum to
 * less than the heading above them — an invoice that visibly does not add up,
 * which is worse than no breakdown at all. So the parts are dropped and the
 * heading stands alone. The document can be terse; it can never be wrong.
 */
export interface InvoicePart {
  /** The admin's own words — "Internet Bid Fee", "storage, 6 days". */
  label: string;
  amountCents: number;
}

export interface InvoiceGroup {
  /** An `OrderCostKind`, carried as a string so translation stays at the edge. */
  kind: string;
  /** The sum of every line in this group, printed against the heading. */
  amountCents: number;
  currency: OrderCurrency;
  /** The indented detail, or empty when there is none to print. */
  parts: InvoicePart[];
}

/**
 * Group the client-visible cost lines by kind, in first-appearance order.
 *
 * Grouped by kind **and currency** together: the auction is billed in USD
 * while EU-side costs can be EUR, and summing across the two would need a
 * rate this function does not have and must not invent. Two currencies of the
 * same kind are therefore two groups, which is the honest rendering — the
 * caller decides whether an invoice carrying both can be issued at all.
 *
 * Unlabelled lines of the same kind are merged into one figure. Nothing is
 * lost by that: without a label there is no way to tell them apart on paper,
 * so two rows reading "Inland transport" with no further detail are noise
 * where one row is information. An admin who wants them itemised labels them,
 * which is also what makes them appear as parts.
 */
export function invoiceGroups(rows: ClientCostRow[]): InvoiceGroup[] {
  const order: string[] = [];
  const byKey = new Map<string, InvoiceGroup>();

  for (const row of rows) {
    const key = `${row.kind}|${row.currency}`;
    let group = byKey.get(key);
    if (!group) {
      group = { kind: row.kind, amountCents: 0, currency: row.currency, parts: [] };
      byKey.set(key, group);
      order.push(key);
    }
    group.amountCents += row.amountCents;

    const label = row.label?.trim();
    if (label) group.parts.push({ label, amountCents: row.amountCents });
  }

  for (const group of byKey.values()) {
    // The self-check described above. A single part that simply restates the
    // heading is also dropped — "Auction fees / Auction fees 823.00" twice
    // over reads as a rendering fault, not as detail.
    const partsTotal = group.parts.reduce((sum, part) => sum + part.amountCents, 0);
    if (group.parts.length < 2 || partsTotal !== group.amountCents) {
      group.parts = [];
    }
  }

  return order.map((key) => byKey.get(key)!);
}

/**
 * What the invoice asks for, and what it must refuse to ask for.
 *
 * An invoice is a demand for a single figure, so it cannot be issued across
 * two currencies without the frozen rate — and this deliberately does NOT
 * take a rate and convert. `vehicleOrders.usdToEurMicros` exists so an admin
 * can record the rate their bank actually gave them; converting here with any
 * other number would print a total the bank will not reproduce.
 *
 * Returns null when the file cannot be invoiced yet, which the caller renders
 * as a refusal rather than as a zero. Treating "unknown" as zero is exactly
 * how the payment panel once congratulated a client on settling an unpriced
 * car.
 */
export interface InvoiceTotal {
  amountCents: number;
  currency: OrderCurrency;
}

export function invoiceTotal(groups: InvoiceGroup[]): InvoiceTotal | null {
  if (groups.length === 0) return null;

  const currencies = new Set(groups.map((g) => g.currency));
  if (currencies.size > 1) return null;

  const currency = groups[0].currency;
  const amountCents = groups.reduce((sum, group) => sum + group.amountCents, 0);
  return { amountCents, currency };
}
