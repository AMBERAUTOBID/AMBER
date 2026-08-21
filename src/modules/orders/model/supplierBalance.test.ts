import { describe, expect, it } from "vitest";
import {
  FALLBACK_CAR_COST_CENTS,
  balanceAlert,
  drawdownNeedsOverride,
  runwayCars,
  supplierBalanceCents,
  type SupplierLedgerRow,
} from "./supplierBalance";

function row(
  kind: SupplierLedgerRow["kind"],
  direction: SupplierLedgerRow["direction"],
  amountCents: number
): SupplierLedgerRow {
  return { kind, direction, amountCents };
}

describe("supplierBalanceCents", () => {
  it("sums credits minus debits", () => {
    const rows = [
      row("top_up", "credit", 5_000_000),
      row("drawdown", "debit", 654_800),
      row("drawdown", "debit", 622_300),
      row("adjustment", "credit", 2_500),
    ];
    expect(supplierBalanceCents(rows)).toBe(5_000_000 - 654_800 - 622_300 + 2_500);
  });

  it("cannot be flipped by a row that stored a negative amount", () => {
    // amountCents is positive by rule; the defence is for the rule failing.
    expect(supplierBalanceCents([row("drawdown", "debit", -100_000)])).toBe(-100_000);
  });

  it("is zero on an empty ledger, not null and not NaN", () => {
    expect(supplierBalanceCents([])).toBe(0);
  });
});

describe("runwayCars", () => {
  it("divides by the average of recent drawdowns", () => {
    const { cars, averageCents } = runwayCars(2_000_000, [600_000, 700_000]);
    expect(averageCents).toBe(650_000);
    expect(cars).toBe(3);
  });

  it("samples only the five most recent, so an old fleet mix ages out", () => {
    const recent = [1_000_000, 1_000_000, 1_000_000, 1_000_000, 1_000_000];
    const stale = [100_000, 100_000, 100_000];
    const { averageCents } = runwayCars(5_000_000, [...recent, ...stale]);
    expect(averageCents).toBe(1_000_000);
  });

  it("falls back to the one real purchase when there is no history", () => {
    const { cars, averageCents } = runwayCars(5_000_000, []);
    expect(averageCents).toBe(FALLBACK_CAR_COST_CENTS);
    expect(cars).toBe(7); // $50,000 ≈ 7 Mercedes-shaped cars
  });

  it("reports zero cars on a zero or negative balance", () => {
    expect(runwayCars(0, [600_000]).cars).toBe(0);
    expect(runwayCars(-50_000, [600_000]).cars).toBe(0);
  });
});

describe("balanceAlert", () => {
  it("shouts empty at zero and below", () => {
    expect(balanceAlert(0, 0)).toBe("empty");
    expect(balanceAlert(-1, 0)).toBe("empty");
  });

  it("warns low under two cars of runway — one car is already too late", () => {
    expect(balanceAlert(700_000, 1)).toBe("low");
    expect(balanceAlert(1_400_000, 2)).toBe("ok");
  });
});

describe("drawdownNeedsOverride — the two-path doctrine of 2026-08-20", () => {
  const firstTimer = {
    kind: "drawdown" as const,
    clientSettled: false,
    repeatClient: false,
    invoiceIssued: false,
    paymentDeclared: false,
  };

  it("waves a repeat client through — financing the trusted is the point", () => {
    expect(drawdownNeedsOverride({ ...firstTimer, repeatClient: true })).toBe(false);
  });

  it("waves a first-timer through once invoiced AND declared", () => {
    // The doctrine's exact sequence: invoice out, client shows the bank's
    // confirmation, THEN we pay — without waiting 1–6 days for the wire.
    expect(
      drawdownNeedsOverride({ ...firstTimer, invoiceIssued: true, paymentDeclared: true })
    ).toBe(false);
  });

  it("still gates a first-timer with only half the sequence", () => {
    expect(drawdownNeedsOverride({ ...firstTimer, invoiceIssued: true })).toBe(true);
    expect(drawdownNeedsOverride({ ...firstTimer, paymentDeclared: true })).toBe(true);
  });

  it("lets a settled file through trivially", () => {
    expect(drawdownNeedsOverride({ ...firstTimer, clientSettled: true })).toBe(false);
  });

  it("treats an orderless drawdown as irregular, not as exempt", () => {
    expect(
      drawdownNeedsOverride({ ...firstTimer, clientSettled: null })
    ).toBe(true);
  });

  it("never gates top-ups or adjustments", () => {
    expect(drawdownNeedsOverride({ ...firstTimer, kind: "top_up" })).toBe(false);
    expect(drawdownNeedsOverride({ ...firstTimer, kind: "adjustment" })).toBe(false);
  });
});
