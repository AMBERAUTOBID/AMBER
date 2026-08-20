import { describe, expect, it } from "vitest";
import { invoiceGroups, invoiceTotal } from "./invoiceLines";
import type { ClientCostRow } from "./money";

/** The real Copart receipt for lot 62288396, which is where the shape came from. */
function mercedes(): ClientCostRow[] {
  return [
    row("1", "auction_price", null, 540_000),
    row("2", "auction_fees", "Internet Bid Fee", 9_900),
    row("3", "auction_fees", "Gate Fee", 7_900),
    row("4", "auction_fees", "Title Pickup Fee", 2_000),
    row("5", "auction_fees", "Buyer Fee", 62_500),
    row("6", "inland_transport", null, 27_500),
    row("7", "commission", null, 40_000),
    row("8", "ocean_freight", null, 115_000),
  ];
}

function row(
  id: string,
  kind: string,
  label: string | null,
  amountCents: number,
  currency: "USD" | "EUR" = "USD"
): ClientCostRow {
  return { id, kind, label, amountCents, currency };
}

describe("invoiceGroups", () => {
  it("prints Copart's four fees under one heading that equals their sum", () => {
    const groups = invoiceGroups(mercedes());

    expect(groups.map((g) => g.kind)).toEqual([
      "auction_price",
      "auction_fees",
      "inland_transport",
      "commission",
      "ocean_freight",
    ]);

    const fees = groups[1];
    expect(fees.amountCents).toBe(82_300);
    expect(fees.parts.map((p) => p.label)).toEqual([
      "Internet Bid Fee",
      "Gate Fee",
      "Title Pickup Fee",
      "Buyer Fee",
    ]);
    // The number the client actually questions: hammer vs total.
    expect(groups[0].amountCents).toBe(540_000);
    expect(invoiceTotal(groups)).toEqual({ amountCents: 804_800, currency: "USD" });
  });

  it("keeps first-appearance order rather than the enum's order", () => {
    const groups = invoiceGroups([
      row("1", "ocean_freight", null, 100_000),
      row("2", "auction_price", null, 500_000),
    ]);
    expect(groups.map((g) => g.kind)).toEqual(["ocean_freight", "auction_price"]);
  });

  it("DROPS a breakdown that does not add up to its own heading", () => {
    // The fault this rule exists for: a fifth fee entered without a label.
    // Four parts summing to $823 printed under a heading of $873 is an invoice
    // that visibly does not add up.
    const groups = invoiceGroups([...mercedes(), row("9", "auction_fees", null, 5_000)]);
    const fees = groups.find((g) => g.kind === "auction_fees")!;

    expect(fees.amountCents).toBe(87_300);
    expect(fees.parts).toEqual([]);
  });

  it("drops a single part, which would only restate its heading", () => {
    const groups = invoiceGroups([row("1", "ocean_freight", "Klaipėda", 115_000)]);
    expect(groups[0].amountCents).toBe(115_000);
    expect(groups[0].parts).toEqual([]);
  });

  it("merges unlabelled lines of the same kind into one figure", () => {
    const groups = invoiceGroups([
      row("1", "inland_transport", null, 27_500),
      row("2", "inland_transport", null, 12_500),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].amountCents).toBe(40_000);
    expect(groups[0].parts).toEqual([]);
  });

  it("treats blank and whitespace labels as absent", () => {
    const groups = invoiceGroups([
      row("1", "auction_fees", "   ", 9_900),
      row("2", "auction_fees", "", 7_900),
    ]);
    expect(groups[0].parts).toEqual([]);
    expect(groups[0].amountCents).toBe(17_800);
  });

  it("never merges across currencies, even for the same kind", () => {
    const groups = invoiceGroups([
      row("1", "customs", null, 25_000, "EUR"),
      row("2", "customs", null, 30_000, "USD"),
    ]);
    expect(groups).toHaveLength(2);
    expect(groups.map((g) => g.currency)).toEqual(["EUR", "USD"]);
  });
});

describe("invoiceTotal", () => {
  it("refuses a two-currency file rather than guessing a rate", () => {
    const groups = invoiceGroups([
      row("1", "auction_price", null, 540_000, "USD"),
      row("2", "customs", null, 25_000, "EUR"),
    ]);
    expect(invoiceTotal(groups)).toBeNull();
  });

  it("refuses an unpriced file rather than returning zero", () => {
    // The distinction the payment panel had to learn the hard way: no lines is
    // "not invoiced yet", which is not the same fact as "nothing to pay".
    expect(invoiceTotal([])).toBeNull();
  });

  it("returns a real zero when the lines genuinely cancel out", () => {
    const groups = invoiceGroups([
      row("1", "other", null, 10_000),
      row("2", "other", null, -10_000),
    ]);
    expect(invoiceTotal(groups)).toEqual({ amountCents: 0, currency: "USD" });
  });
});
