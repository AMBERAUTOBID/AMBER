import { describe, expect, it } from "vitest";
import {
  heldForBidding,
  quoteDeposit,
  topUpRequired,
  type DepositLedgerRow,
} from "./depositBalance";

const row = (depositStatus: string, depositRequiredCents: number): DepositLedgerRow => ({
  depositStatus,
  depositRequiredCents,
});

describe("what we are holding", () => {
  it("counts only the holds actually received", () => {
    expect(
      heldForBidding([
        row("received", 80_000),
        row("received", 20_000),
        row("awaiting", 50_000),
        row("not_required", 0),
      ])
    ).toBe(100_000);
  });

  it("stops counting a hold once it has been returned", () => {
    expect(heldForBidding([row("returned", 80_000)])).toBe(0);
  });

  it("stops counting a hold that was forfeited", () => {
    // The owner's own reasoning: the money has already been spent covering our
    // loss, so a balance that still counted it would show the client funds
    // that no longer exist.
    expect(heldForBidding([row("forfeited", 80_000)])).toBe(0);
  });

  it("NEVER goes negative when a hold is returned", () => {
    /**
     * The trap the specification's wording sets. Written as
     * `Σ received − Σ returned − Σ forfeited` it reads like an event ledger —
     * but a row carries one current status, so a returned hold is no longer
     * `received`. Subtracting it as well would take the money off twice.
     */
    const returnedEverything = [row("returned", 80_000), row("forfeited", 20_000)];
    expect(heldForBidding(returnedEverything)).toBe(0);
    expect(heldForBidding(returnedEverything)).toBeGreaterThanOrEqual(0);
  });

  it("is zero for a client who has never posted one", () => {
    expect(heldForBidding([])).toBe(0);
  });
});

describe("what a new instruction asks for", () => {
  it("asks only for the difference — the double-charge this exists to stop", () => {
    // Lost on an $8,000 car holding $800, now bidding $9,000 (rule: $900).
    expect(topUpRequired(90_000, 80_000)).toBe(10_000);
  });

  it("asks for nothing when the balance already covers the car", () => {
    expect(topUpRequired(50_000, 80_000)).toBe(0);
  });

  it("never returns the surplus as a negative charge", () => {
    // Refunding is a deliberate act somebody starts, never a side effect of
    // placing a bid.
    expect(topUpRequired(10_000, 80_000)).toBe(0);
  });

  it("asks for the whole figure from a client holding nothing", () => {
    expect(topUpRequired(90_000, 0)).toBe(90_000);
  });
});

describe("the quote a page renders", () => {
  it("distinguishes 'covered by your balance' from 'no deposit needed'", () => {
    /**
     * A car under the free threshold needs nothing from anybody. This client
     * needs a hold and has already posted it. Calling both "no deposit
     * required" would misdescribe their own money — they would have no way to
     * know we were still holding $800 of it.
     */
    const covered = quoteDeposit(50_000, 80_000);
    expect(covered.dueCents).toBe(0);
    expect(covered.coveredByBalance).toBe(true);

    const free = quoteDeposit(0, 0);
    expect(free.dueCents).toBe(0);
    expect(free.coveredByBalance).toBe(false);
  });

  it("carries all three figures, so a page never recomputes one", () => {
    const q = quoteDeposit(90_000, 80_000);
    expect(q).toEqual({
      ruleCents: 90_000,
      heldCents: 80_000,
      dueCents: 10_000,
      coveredByBalance: false,
    });
  });
});
