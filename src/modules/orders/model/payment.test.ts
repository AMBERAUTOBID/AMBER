import { describe, expect, it } from "vitest";
import {
  paymentDueAt,
  paymentStatus,
  PAYMENT_DUE_HOURS,
  SHORT_PAYMENT_TOLERANCE_CENTS,
} from "./payment";

const SOLD = new Date("2026-08-15T18:00:00Z");
const hoursAfterSale = (h: number) => new Date(SOLD.getTime() + h * 3_600_000);

describe("paymentDueAt", () => {
  it("is 24 hours after the sale, not after the invoice", () => {
    // The clock is a fact about the auction, not about how fast an admin got
    // to the paperwork. US sales end at 01:00 Lithuanian time.
    expect(paymentDueAt(SOLD)).toEqual(new Date("2026-08-16T18:00:00Z"));
  });

  it("has no deadline when the sale instant was never recorded", () => {
    // Never "immediately overdue": we cannot call somebody late against a time
    // we did not record, and an invented deadline would send a dunning email
    // to a client who has done nothing wrong.
    expect(paymentDueAt(null)).toBeNull();
    expect(paymentDueAt(undefined)).toBeNull();
  });
});

describe("paymentStatus", () => {
  const owing = (balanceCents: number, paymentsMade = 0) => ({
    soldAt: SOLD,
    balanceCents,
    paymentsMade,
    costLineCount: 3,
  });

  it("counts down while there is time in hand", () => {
    const s = paymentStatus(owing(1_580_000), hoursAfterSale(2));
    expect(s.state).toBe("due");
    expect(s.hoursLeft).toBeCloseTo(22, 6);
    expect(s.outstandingCents).toBe(1_580_000);
  });

  it("turns urgent in the last six hours", () => {
    expect(paymentStatus(owing(1_580_000), hoursAfterSale(19)).state).toBe("urgent");
    expect(paymentStatus(owing(1_580_000), hoursAfterSale(18)).state).toBe("due");
  });

  it("is overdue once the deadline passes", () => {
    const s = paymentStatus(owing(1_580_000), hoursAfterSale(PAYMENT_DUE_HOURS + 1));
    expect(s.state).toBe("overdue");
    expect(s.hoursLeft).toBeLessThan(0);
  });

  it("settles when nothing is owed", () => {
    expect(paymentStatus(owing(0, 1), hoursAfterSale(2)).state).toBe("settled");
  });

  /**
   * The case that would otherwise jam the whole system. An intermediary bank
   * shaves a wire, $45 never arrives, and the order can never reach `settled` —
   * which also means the client can never get their deposit back, because that
   * rule refuses while any order is open.
   */
  it("forgives a wire that arrived a little short", () => {
    const s = paymentStatus(owing(2_500, 1), hoursAfterSale(2));
    expect(s.state).toBe("settled");
    expect(s.shortfallForgiven).toBe(true);
    expect(s.outstandingCents).toBe(0);
  });

  it("does NOT forgive a small invoice nobody has paid", () => {
    // Same amount, no payment behind it: that is a $25 invoice, not a rounding
    // error, and forgiving it would mark it settled before a cent arrived.
    const s = paymentStatus(owing(2_500, 0), hoursAfterSale(2));
    expect(s.state).toBe("due");
    expect(s.shortfallForgiven).toBe(false);
    expect(s.outstandingCents).toBe(2_500);
  });

  it("does not forgive a real underpayment", () => {
    const s = paymentStatus(owing(SHORT_PAYMENT_TOLERANCE_CENTS + 1, 1), hoursAfterSale(2));
    expect(s.state).toBe("due");
    expect(s.shortfallForgiven).toBe(false);
  });

  it("owes money but claims no deadline when the sale instant is missing", () => {
    const s = paymentStatus({ soldAt: null, balanceCents: 1_580_000, paymentsMade: 0, costLineCount: 3 }, SOLD);
    expect(s.state).toBe("undated");
    expect(s.dueAt).toBeNull();
    expect(s.hoursLeft).toBeNull();
  });

  it("never reports a negative amount outstanding", () => {
    // An overpayment is not a debt in the other direction on this screen.
    const s = paymentStatus(owing(-5_000, 1), hoursAfterSale(2));
    expect(s.state).toBe("settled");
    expect(s.outstandingCents).toBe(0);
  });

  it("treats an unknown balance as nothing owed rather than guessing", () => {
    // `orderMoney` returns null when no rate reconciles the two currencies.
    const s = paymentStatus({ soldAt: SOLD, balanceCents: null, paymentsMade: 0, costLineCount: 3 }, SOLD);
    expect(s.state).toBe("settled");
  });
});

describe("an order nobody has priced yet", () => {
  /**
   * The bug this was written for, found by opening a real case file: a fresh
   * order has no cost lines, so the balance is zero for the same arithmetic
   * reason a fully paid one is — and the page cheerfully told the client
   * "paid in full" about a car nobody had costed. `orderMoney()` already drew
   * this distinction; the payment status did not.
   */
  it("is awaiting costs, not settled", () => {
    const s = paymentStatus(
      { soldAt: SOLD, balanceCents: null, paymentsMade: 0, costLineCount: 0 },
      hoursAfterSale(2)
    );
    expect(s.state).toBe("awaiting_costs");
    expect(s.outstandingCents).toBe(0);
  });

  it("still knows when payment will be due, so the client can plan", () => {
    const s = paymentStatus(
      { soldAt: SOLD, balanceCents: null, paymentsMade: 0, costLineCount: 0 },
      hoursAfterSale(2)
    );
    expect(s.dueAt).toEqual(new Date("2026-08-16T18:00:00Z"));
  });
});
