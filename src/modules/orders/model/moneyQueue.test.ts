import { describe, expect, it } from "vitest";
import {
  buildContainerQueue,
  buildMoneyQueue,
  moneyQueueRow,
  type ContainerQueueInput,
  type MoneyQueueInput,
} from "./moneyQueue";

const SOLD = new Date("2026-08-15T18:00:00Z");
const hoursAfterSale = (h: number) => new Date(SOLD.getTime() + h * 3_600_000);

let seq = 0;
function order(overrides: Partial<MoneyQueueInput> = {}): MoneyQueueInput {
  seq += 1;
  return {
    id: `id-${seq}`,
    reference: `SAB-2026-${String(seq).padStart(4, "0")}`,
    soldAt: SOLD,
    year: 2019,
    make: "BMW",
    model: "X5",
    lotNumber: `${40000000 + seq}`,
    clientName: "Test Client",
    clientEmail: "client@example.com",
    rateMicros: null,
    costUsdCents: 1_580_000,
    costEurCents: 0,
    costLineCount: 3,
    paidUsdCents: 0,
    paidEurCents: 0,
    paymentCount: 0,
    declaredAt: null,
    lastPaymentRecordedAt: null,
    ...overrides,
  };
}

describe("one order's money", () => {
  it("adds the per-currency sums the database handed it", () => {
    // The aggregation is only safe because `orderMoney` sums within a
    // currency: one row carrying the total must give the same answer as the
    // rows it came from.
    const row = moneyQueueRow(
      order({ costUsdCents: 1_580_000, paidUsdCents: 500_000, paymentCount: 1 }),
      hoursAfterSale(2)
    );
    expect(row.status.outstandingCents).toBe(1_080_000);
    expect(row.currency).toBe("USD");
  });

  it("quotes euros once a rate is frozen, as the client's own page does", () => {
    const row = moneyQueueRow(order({ rateMicros: 925_000 }), hoursAfterSale(2));
    expect(row.currency).toBe("EUR");
    expect(row.status.outstandingCents).toBe(1_461_500);
  });

  it("quotes euros on a euro-only file even with no rate to convert", () => {
    // Nothing needs reconciling when only one currency is present, so the
    // figure is answerable and it is a euro one.
    const row = moneyQueueRow(
      order({ costUsdCents: 0, costEurCents: 1_461_500, rateMicros: null }),
      hoursAfterSale(2)
    );
    expect(row.currency).toBe("EUR");
    expect(row.status.outstandingCents).toBe(1_461_500);
  });

  it("calls an empty file dollars, not euros", () => {
    /**
     * Found against the real mirror: with no cost lines both balances are a
     * legitimate zero, so "is the euro balance non-null?" answered EUR for a
     * car whose costs will arrive in dollars. Nothing prints that zero today,
     * which is exactly why it would have sat there until something did.
     */
    const row = moneyQueueRow(
      order({ costUsdCents: 0, costEurCents: 0, costLineCount: 0, rateMicros: null }),
      hoursAfterSale(2)
    );
    expect(row.currency).toBe("USD");
    expect(row.status.state).toBe("awaiting_costs");
  });

  it("forgives a wire shaved by an intermediary bank", () => {
    const row = moneyQueueRow(
      order({ costUsdCents: 1_580_000, paidUsdCents: 1_577_500, paymentCount: 1 }),
      hoursAfterSale(2)
    );
    expect(row.status.state).toBe("settled");
  });
});

describe("the client saying they have sent it", () => {
  it("is still waiting when no payment has been recorded since", () => {
    const row = moneyQueueRow(
      order({ declaredAt: hoursAfterSale(3), lastPaymentRecordedAt: null }),
      hoursAfterSale(5)
    );
    expect(row.awaitingCheck).toBe(true);
  });

  it("is answered by a payment recorded afterwards", () => {
    const row = moneyQueueRow(
      order({
        declaredAt: hoursAfterSale(3),
        lastPaymentRecordedAt: hoursAfterSale(4),
        paidUsdCents: 500_000,
        paymentCount: 1,
      }),
      hoursAfterSale(5)
    );
    // Part-paid, so still owed — but nobody needs to go and look in the bank
    // again for a transfer we have already found.
    expect(row.status.state).not.toBe("settled");
    expect(row.awaitingCheck).toBe(false);
  });

  it("is NOT answered by a payment recorded before it", () => {
    /**
     * The client paid a deposit on Monday, we recorded it, then on Wednesday
     * they wired the balance and said so. Comparing against the older record
     * would silently swallow the second message.
     */
    const row = moneyQueueRow(
      order({
        declaredAt: hoursAfterSale(10),
        lastPaymentRecordedAt: hoursAfterSale(4),
        paidUsdCents: 500_000,
        paymentCount: 1,
      }),
      hoursAfterSale(12)
    );
    expect(row.awaitingCheck).toBe(true);
  });
});

describe("the queue", () => {
  it("leaves settled orders out entirely", () => {
    const queue = buildMoneyQueue(
      [order({ paidUsdCents: 1_580_000, paymentCount: 1 })],
      hoursAfterSale(2)
    );
    expect(queue.owed).toHaveLength(0);
    expect(queue.notInvoiced).toHaveLength(0);
    expect(queue.declared).toHaveLength(0);
    expect(queue.totals.orders).toBe(0);
  });

  it("puts the most overdue first and the most distant last", () => {
    const wonLongAgo = order({ soldAt: new Date("2026-08-10T18:00:00Z") });
    const wonYesterday = order({ soldAt: new Date("2026-08-15T06:00:00Z") });
    const wonJustNow = order({ soldAt: new Date("2026-08-15T17:00:00Z") });

    const queue = buildMoneyQueue([wonJustNow, wonLongAgo, wonYesterday], hoursAfterSale(2));
    expect(queue.owed.map((r) => r.reference)).toEqual([
      wonLongAgo.reference,
      wonYesterday.reference,
      wonJustNow.reference,
    ]);
    expect(queue.owed[0]!.status.state).toBe("overdue");
  });

  it("puts an order with no sale date last, never ahead of a real deadline", () => {
    // It is owed, but no deadline can be claimed against it — so it must not
    // displace a car that is genuinely running out of time.
    const undated = order({ soldAt: null });
    const dated = order({ soldAt: new Date("2026-08-15T17:00:00Z") });

    const queue = buildMoneyQueue([undated, dated], hoursAfterSale(2));
    expect(queue.owed.map((r) => r.reference)).toEqual([dated.reference, undated.reference]);
  });

  it("separates the ones a client says they have paid from the ones to chase", () => {
    const said = order({ declaredAt: hoursAfterSale(1) });
    const silent = order({});

    const queue = buildMoneyQueue([said, silent], hoursAfterSale(2));
    expect(queue.declared.map((r) => r.reference)).toEqual([said.reference]);
    expect(queue.owed.map((r) => r.reference)).toEqual([silent.reference]);
    // Mutually exclusive, so the counts beside the headings add up.
    expect(queue.totals.orders).toBe(2);
  });

  it("shows the declaration we have left waiting longest first", () => {
    const old = order({ declaredAt: hoursAfterSale(1) });
    const recent = order({ declaredAt: hoursAfterSale(9) });

    const queue = buildMoneyQueue([recent, old], hoursAfterSale(10));
    expect(queue.declared.map((r) => r.reference)).toEqual([old.reference, recent.reference]);
  });

  it("lists an un-invoiced car by its deadline, not by its reference", () => {
    /**
     * `hoursLeft` is null while there is no figure to count down to, so
     * ordering these by urgency alone would fall back to the reference and put
     * the car whose deadline expires first anywhere at all.
     */
    const later = order({ costLineCount: 0, costUsdCents: 0, soldAt: hoursAfterSale(4) });
    const sooner = order({ costLineCount: 0, costUsdCents: 0, soldAt: SOLD });

    const queue = buildMoneyQueue([later, sooner], hoursAfterSale(2));
    expect(queue.notInvoiced.map((r) => r.reference)).toEqual([sooner.reference, later.reference]);
  });

  it("keeps an un-invoiced car out of the amount owed, and says one is missing", () => {
    const queue = buildMoneyQueue(
      [order({ costLineCount: 0, costUsdCents: 0 }), order({ costUsdCents: 1_000_000 })],
      hoursAfterSale(2)
    );
    expect(queue.totals.usdCents).toBe(1_000_000);
    expect(queue.totals.orders).toBe(1);
    expect(queue.totals.unknown).toBe(1);
  });

  it("does not lose an order whose currencies have no rate to reconcile them", () => {
    /**
     * The fault this list was nearly built on top of: a mixed-currency file
     * with no frozen rate has a null balance, that used to read as `settled`,
     * and the order would have vanished from the one screen that exists to
     * list what is owed. It belongs with the un-invoiced — an admin must go
     * and set the rate.
     */
    const queue = buildMoneyQueue(
      [order({ costUsdCents: 1_000_000, costEurCents: 50_000, rateMicros: null })],
      hoursAfterSale(2)
    );
    expect(queue.notInvoiced).toHaveLength(1);
    expect(queue.notInvoiced[0]!.status.state).toBe("needs_rate");
    expect(queue.totals.unknown).toBe(1);
  });

  it("keeps a declaration on an un-invoiced car in the un-invoiced list", () => {
    // Some clients pay against a figure we emailed them. The missing invoice
    // is still what blocks the file, so the row stays where the work is.
    const queue = buildMoneyQueue(
      [order({ costLineCount: 0, costUsdCents: 0, declaredAt: hoursAfterSale(1) })],
      hoursAfterSale(2)
    );
    expect(queue.notInvoiced).toHaveLength(1);
    expect(queue.declared).toHaveLength(0);
    expect(queue.notInvoiced[0]!.awaitingCheck).toBe(true);
  });

  it("totals the two currencies separately rather than inventing a rate", () => {
    const queue = buildMoneyQueue(
      [
        order({ costUsdCents: 1_000_000 }),
        order({ costUsdCents: 0, costEurCents: 200_000, rateMicros: 925_000 }),
      ],
      hoursAfterSale(2)
    );
    expect(queue.totals.usdCents).toBe(1_000_000);
    expect(queue.totals.eurCents).toBe(200_000);
    expect(queue.totals.orders).toBe(2);
  });
});

describe("the container freight queue", () => {
  let cntSeq = 0;
  function container(overrides: Partial<ContainerQueueInput> = {}): ContainerQueueInput {
    cntSeq += 1;
    return {
      id: `cnt-${cntSeq}`,
      reference: `CNT-2026-${String(cntSeq).padStart(4, "0")}`,
      containerType: "40ft",
      freightCents: 320_000,
      dueAt: new Date("2026-09-01T12:00:00Z"),
      paidAt: null,
      clientName: "Volume Buyer",
      clientEmail: "volume@example.com",
      carCount: 4,
      firstOrderId: `order-${cntSeq}`,
      invoiceIssued: true,
      ...overrides,
    };
  }

  it("drops paid containers entirely — a queue lists only unresolved work", () => {
    const queue = buildContainerQueue([
      container({ paidAt: new Date("2026-08-20T10:00:00Z") }),
      container(),
    ]);
    expect(queue.rows).toHaveLength(1);
    expect(queue.rows[0]!.paidAt).toBeNull();
  });

  it("orders by deadline, soonest first, reference as the tiebreak", () => {
    const later = container({ dueAt: new Date("2026-09-10T12:00:00Z") });
    const soonB = container({ dueAt: new Date("2026-09-01T12:00:00Z"), reference: "CNT-2026-0202" });
    const soonA = container({ dueAt: new Date("2026-09-01T12:00:00Z"), reference: "CNT-2026-0101" });
    const queue = buildContainerQueue([later, soonB, soonA]);
    expect(queue.rows.map((r) => r.reference)).toEqual([
      "CNT-2026-0101",
      "CNT-2026-0202",
      later.reference,
    ]);
  });

  it("totals only what is actually unpaid", () => {
    const queue = buildContainerQueue([
      container({ freightCents: 320_000 }),
      container({ freightCents: 280_000 }),
      container({ freightCents: 999_999, paidAt: new Date("2026-08-20T10:00:00Z") }),
    ]);
    expect(queue.totalCents).toBe(600_000);
  });

  it("is empty-in, empty-out — the all-clear state must be reachable", () => {
    const queue = buildContainerQueue([]);
    expect(queue.rows).toHaveLength(0);
    expect(queue.totalCents).toBe(0);
  });
});
