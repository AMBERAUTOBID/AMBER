import { describe, expect, it } from "vitest";
import {
  eurCentsToUsd,
  formatRate,
  orderMoney,
  parseAmountToCents,
  parseRateToMicros,
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

describe("parseAmountToCents — where money bugs live", () => {
  it("reads the plain cases", () => {
    expect(parseAmountToCents("1420")).toBe(142_000);
    expect(parseAmountToCents("1420.50")).toBe(142_050);
    expect(parseAmountToCents("0.99")).toBe(99);
    expect(parseAmountToCents("0")).toBe(0);
  });

  it("reads a Lithuanian decimal comma", () => {
    // The admin working in Lithuanian types this. Treating the comma as a
    // thousands separator would give 142050 instead of 1420.50 — a
    // hundredfold error in the field that decides what a client owes.
    expect(parseAmountToCents("1420,50")).toBe(142_050);
  });

  it("reads an American figure pasted from an invoice", () => {
    expect(parseAmountToCents("1,420.50")).toBe(142_050);
    expect(parseAmountToCents("14,200")).toBe(1_420_000);
  });

  it("reads a European figure with dots as thousands", () => {
    expect(parseAmountToCents("1.420,50")).toBe(142_050);
    expect(parseAmountToCents("14.200,00")).toBe(1_420_000);
  });

  it("resolves the ambiguity by POSITION, not by locale", () => {
    // The page's locale says nothing about what was pasted into it. Whichever
    // separator comes last is the decimal one.
    expect(parseAmountToCents("1,420")).toBe(142_000);
    expect(parseAmountToCents("1.420")).toBe(142_000);
  });

  it("ignores the spaces and symbols a paste brings along", () => {
    expect(parseAmountToCents(" $1 420.50 ")).toBe(142_050);
    expect(parseAmountToCents("1 420,50 €")).toBe(142_050);
    expect(parseAmountToCents("1’420.50")).toBe(142_050);
  });

  it("treats EXACTLY three digits as a thousands group, ambiguity and all", () => {
    // `1,420` and `10.005` are the same shape, and only the domain decides.
    // Here the amounts are car prices, auction fees and ocean freight, and
    // money is never entered to three decimals — so reading `1,420` as 1.42
    // would understate a cost line by a factor of a thousand.
    expect(parseAmountToCents("10.005")).toBe(1_000_500);
    expect(parseAmountToCents("1,420")).toBe(142_000);
  });

  it("but reads four or more decimals as a decimal, and rounds", () => {
    // Four digits is not a thousands group, it is a paste artefact. Stripping
    // the separator there would multiply the figure instead of rounding it.
    expect(parseAmountToCents("10.0051")).toBe(1001);
    expect(parseAmountToCents("10.0049")).toBe(1000);
  });

  it("returns NULL, never zero, for something that is not an amount", () => {
    // Zero is a real amount somebody might mean. A silent zero on a cost line
    // is worse than a form that refuses to submit.
    for (const bad of ["", "  ", "abc", "-", "1.2.3.4x", "€", "--5"]) {
      expect(parseAmountToCents(bad), bad).toBeNull();
    }
  });

  it("refuses a negative amount", () => {
    // A refund is a payment with its own row, not a negative cost line.
    expect(parseAmountToCents("-100")).toBeNull();
  });
});

describe("parseRateToMicros", () => {
  it("reads a rate to four decimals", () => {
    expect(parseRateToMicros("0.925")).toBe(925_000);
    expect(parseRateToMicros("0,9250")).toBe(925_000);
    expect(parseRateToMicros("1.0850")).toBe(1_085_000);
  });

  it("refuses anything outside a plausible range", () => {
    // A misplaced decimal or micros pasted in by mistake would quietly restate
    // every euro figure on the file by a factor of ten.
    expect(parseRateToMicros("0.0925")).toBeNull();
    expect(parseRateToMicros("92.5")).toBeNull();
    expect(parseRateToMicros("925000")).toBeNull();
  });

  it("refuses nonsense", () => {
    expect(parseRateToMicros("")).toBeNull();
    expect(parseRateToMicros("abc")).toBeNull();
  });
});

describe("formatRate", () => {
  it("reads the way a rate is written down", () => {
    expect(formatRate(925_000)).toBe("0.9250");
    expect(formatRate(1_085_000)).toBe("1.0850");
  });
});
