/**
 * The security-deposit rule for free-tier bid instructions.
 *
 * Tested hard for the same reason `planChangeFor` is: this decides how much
 * money we ask a client for. A missing guard shows up as an error; a wrong
 * multiplication shows up as an invoice, and this one is quoted to somebody
 * before they have bought anything.
 */
import { describe, expect, it } from "vitest";
import {
  bidDepositFor,
  depositOverrideNeedsPassword,
  tierCovering,
  DEPOSIT_FREE_AT_OR_BELOW_CENTS,
  PER_CAR_DEPOSIT_CEILING_CENTS,
} from "./bidDeposit";
import { PLANS } from "@/modules/plans/model/plans";

const usd = (dollars: number) => dollars * 100;

describe("small cars carry no hold", () => {
  it("a $3,000 bid needs nothing", () => {
    expect(bidDepositFor(usd(3000))).toEqual({ kind: "none" });
  });

  it("the free band includes its own boundary", () => {
    // At exactly $5,000 there is still no deposit. Stated as a test because
    // "up to $5,000" and "under $5,000" are different promises and the copy
    // says the first one.
    expect(bidDepositFor(DEPOSIT_FREE_AT_OR_BELOW_CENTS)).toEqual({ kind: "none" });
    expect(bidDepositFor(DEPOSIT_FREE_AT_OR_BELOW_CENTS + 1).kind).toBe("per_car");
  });

  it("a zero or nonsense amount is not charged for", () => {
    expect(bidDepositFor(0)).toEqual({ kind: "none" });
    expect(bidDepositFor(-500)).toEqual({ kind: "none" });
  });
});

describe("the ten percent band", () => {
  it("$8,000 asks for $800", () => {
    expect(bidDepositFor(usd(8000))).toEqual({ kind: "per_car", cents: usd(800) });
  });

  it("$10,000 asks for $1,000 — the top of the band", () => {
    expect(bidDepositFor(PER_CAR_DEPOSIT_CEILING_CENTS)).toEqual({
      kind: "per_car",
      cents: usd(1000),
    });
  });

  it("is quoted in whole dollars", () => {
    // $7,777 → $777.70 exactly, which nobody wants to see on a transfer
    // instruction. Rounded to the dollar.
    const deposit = bidDepositFor(usd(7777));
    expect(deposit.kind).toBe("per_car");
    expect((deposit as { cents: number }).cents % 100).toBe(0);
  });

  it("never exceeds the cheapest tier that would cover the same bid", () => {
    // The whole argument for stopping at $10,000: a per-car hold must never
    // cost more than a plan that covers every car.
    for (let dollars = 5100; dollars <= 10000; dollars += 100) {
      const deposit = bidDepositFor(usd(dollars));
      if (deposit.kind !== "per_car") continue;
      expect(deposit.cents).toBeLessThanOrEqual(PLANS.silver.depositUsdCents);
    }
  });
});

describe("above $10,000 the answer is a plan, not a bigger hold", () => {
  it("$15,000 is quoted Gold", () => {
    expect(bidDepositFor(usd(15000))).toEqual({
      kind: "needs_plan",
      planKey: "gold",
      cents: PLANS.gold.depositUsdCents,
    });
  });

  it("$30,000 is quoted Platinum", () => {
    expect(bidDepositFor(usd(30000))).toEqual({
      kind: "needs_plan",
      planKey: "platinum",
      cents: PLANS.platinum.depositUsdCents,
    });
  });

  it("the tier quoted always actually covers the bid", () => {
    for (const dollars of [10001, 12000, 24999, 25000, 25001, 49999, 50000]) {
      const deposit = bidDepositFor(usd(dollars));
      if (deposit.kind !== "needs_plan") continue;
      const cap = PLANS[deposit.planKey].maxBidUsd;
      expect(cap, `${dollars} quoted ${deposit.planKey} with no cap`).not.toBeNull();
      expect(cap! * 100).toBeGreaterThanOrEqual(usd(dollars));
    }
  });

  it("beyond every tier we sell, no number is invented", () => {
    // $80,000 exceeds Platinum's $50,000 cap. A person decides; the software
    // must not quote a figure it has no basis for.
    expect(bidDepositFor(usd(80000))).toEqual({ kind: "beyond_tiers" });
  });
});

describe("tierCovering never answers with the free plan", () => {
  it("skips uncapped tiers", () => {
    // Bronze has maxBidUsd null. "The cheapest plan covering $30,000" must not
    // be "the free one" just because it has no cap written down.
    expect(tierCovering(usd(30000))).toBe("platinum");
    expect(tierCovering(usd(9000))).toBe("silver");
  });

  it("picks the cheapest that fits, not the first that fits", () => {
    expect(tierCovering(usd(20000))).toBe("gold");
  });

  it("returns null when nothing covers it", () => {
    expect(tierCovering(usd(999999))).toBeNull();
  });
});

describe("the password guards one direction only", () => {
  it("waiving a deposit needs it", () => {
    expect(depositOverrideNeedsPassword(usd(1000), 0)).toBe(true);
  });

  it("reducing a deposit needs it", () => {
    expect(depositOverrideNeedsPassword(usd(1000), usd(400))).toBe(true);
  });

  it("raising a deposit does not", () => {
    // Somebody being more careful than the rule should not be slowed down —
    // and a password asked for every change is a password typed without
    // reading the screen.
    expect(depositOverrideNeedsPassword(usd(1000), usd(2500))).toBe(false);
  });

  it("leaving it alone does not", () => {
    expect(depositOverrideNeedsPassword(usd(1000), usd(1000))).toBe(false);
  });
});
