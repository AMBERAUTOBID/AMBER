import { describe, expect, it } from "vitest";
import {
  eurCentsToUsd,
  formatRate,
  orderMoney,
  usdCentsToEur,
  type MoneyRow,
} from "./money";

/** 0.925 EUR per USD, the shape the column stores. */
const RATE = 925_000;

const usd = (cents: number): MoneyRow => ({ amountCents: cents, currency: "USD" });
const eur = (cents: number): MoneyRow => ({ amountCents: cents, currency: "EUR" });

describe("conversion", () => {
  it("converts with the frozen rate", () => {
    expect(usdCentsToEur(100_000, RATE)).toBe(92_500);
    expect(eurCentsToUsd(92_500, RATE)).toBe(100_000);
  });

  it("rounds to whole cents rather than carrying fractions", () => {
    // A fraction of a cent surviving into a total is how two figures on one
    // page stop agreeing with each other.
    expect(usdCentsToEur(333, RATE)).toBe(308);
    expect(Number.isInteger(usdCentsToEur(12_345, RATE))).toBe(true);
  });

  it("round-trips within a cent", () => {
    const there = usdCentsToEur(123_456, RATE);
    expect(Math.abs(eurCentsToUsd(there, RATE) - 123_456)).toBeLessThanOrEqual(1);
  });
});

describe("orderMoney — a single-currency file", () => {
  it("adds up without needing a rate at all", () => {
    // The common case early on: everything is still USD from the auction.
    const money = orderMoney([usd(1_420_000), usd(85_000)], [usd(500_000)], null);
    expect(money.cost.totalUsd).toBe(1_505_000);
    expect(money.paid.totalUsd).toBe(500_000);
    expect(money.balanceUsd).toBe(1_005_000);
  });

  it("reports the other currency as unknown, not as zero", () => {
    const money = orderMoney([usd(100_000)], [], null);
    expect(money.cost.totalEur).toBeNull();
    expect(money.balanceEur).toBeNull();
  });
});

describe("orderMoney — both currencies, which is the real case", () => {
  const lines = [usd(1_420_000), usd(85_000), eur(30_000)];
  const payments = [usd(500_000), eur(30_000)];

  it("REFUSES to total a mixed file with no rate", () => {
    // A total that silently dropped the EUR lines would be a smaller,
    // confident, wrong number, and the client would find the difference when
    // they came to pay it.
    const money = orderMoney(lines, payments, null);
    expect(money.cost.totalUsd).toBeNull();
    expect(money.cost.totalEur).toBeNull();
    expect(money.balanceUsd).toBeNull();
  });

  it("still exposes the untouched per-currency subtotals", () => {
    // Not being able to combine them is no reason to show nothing.
    const money = orderMoney(lines, payments, null);
    expect(money.cost.usdOnly).toBe(1_505_000);
    expect(money.cost.eurOnly).toBe(30_000);
  });

  it("totals in both currencies once the rate is set", () => {
    const money = orderMoney(lines, payments, RATE);
    // 1,505,000 USD cents + 30,000 EUR cents at 0.925 → +32,432 USD cents
    expect(money.cost.totalUsd).toBe(1_505_000 + eurCentsToUsd(30_000, RATE));
    expect(money.cost.totalEur).toBe(usdCentsToEur(1_505_000, RATE) + 30_000);
  });

  it("computes a balance in both currencies", () => {
    const money = orderMoney(lines, payments, RATE);
    expect(money.balanceUsd).toBe(money.cost.totalUsd! - money.paid.totalUsd!);
    expect(money.balanceEur).toBe(money.cost.totalEur! - money.paid.totalEur!);
    expect(money.balanceUsd).toBeGreaterThan(0);
  });
});

describe("settled", () => {
  it("is true when the balance is exactly zero", () => {
    expect(orderMoney([usd(100_000)], [usd(100_000)], RATE).settled).toBe(true);
  });

  it("is true on an overpayment, which is still not owing anything", () => {
    expect(orderMoney([usd(100_000)], [usd(120_000)], RATE).settled).toBe(true);
  });

  it("is false while anything is outstanding", () => {
    expect(orderMoney([usd(100_000)], [usd(99_999)], RATE).settled).toBe(false);
  });

  it("is FALSE when the balance cannot be established, never a guess", () => {
    // "Paid in full" is a statement nobody should make on incomplete
    // information, least of all to the person who would then stop paying.
    const money = orderMoney([usd(100_000), eur(1)], [], null);
    expect(money.balanceUsd).toBeNull();
    expect(money.settled).toBe(false);
  });

  it("is true for an empty file, which owes nothing", () => {
    expect(orderMoney([], [], null).settled).toBe(true);
  });
});

describe("formatRate", () => {
  it("reads the way a rate is written down", () => {
    expect(formatRate(925_000)).toBe("0.9250");
    expect(formatRate(1_085_000)).toBe("1.0850");
  });
});
