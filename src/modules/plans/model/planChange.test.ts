/**
 * The arithmetic behind moving between tiers.
 *
 * Split out of `requestPlan` and tested without a database on purpose: this
 * function decides **how much money we ask a client to transfer**, and it is
 * the one part of the feature that can be wrong quietly. A missing guard shows
 * up as a 500; a wrong subtraction shows up as an invoice.
 *
 * The rule every case below is checking:
 *
 *     Σ confirmed − Σ refunded = the money actually held for that client
 *
 * must survive the change. So a top-up asks for the difference and never the
 * headline price — $1,500 already held plus $1,000 transferred is the $2,500
 * tier, and both rows describe a transfer that really happened.
 */
import { describe, expect, it } from "vitest";
import { planChangeFor, type Ledger } from "./deposits";
import { PLANS, PLAN_KEYS } from "./plans";

const FRESH: Ledger = { heldCents: 0, hasHistory: false, refundPending: false };
const held = (cents: number): Ledger => ({
  heldCents: cents,
  hasHistory: true,
  refundPending: false,
});

describe("a client with nothing held pays the full deposit", () => {
  for (const key of PLAN_KEYS) {
    it(`${key}: ${PLANS[key].depositUsdCents} cents in full`, () => {
      expect(planChangeFor(PLANS[key].depositUsdCents, FRESH)).toEqual({
        kind: "first",
        amountCents: PLANS[key].depositUsdCents,
      });
    });
  }

  it("free tiers are a first request too, not a refused zero", () => {
    // Bronze costs nothing, so the difference *and* the full price are both
    // zero. Registration must still produce a row: without one there is
    // nothing for an admin to confirm, and confirming is what grants the plan.
    expect(planChangeFor(0, FRESH)).toEqual({ kind: "first", amountCents: 0 });
  });
});

describe("moving up transfers the difference and nothing more", () => {
  it("$1,500 held → the $2,500 tier costs $1,000", () => {
    expect(planChangeFor(250000, held(150000))).toEqual({ kind: "top_up", amountCents: 100000 });
  });

  it("two upgrades in a row still add up to the tier's price", () => {
    // silver → gold → platinum, the path most likely to drift.
    const first = planChangeFor(PLANS.gold.depositUsdCents, held(PLANS.silver.depositUsdCents));
    expect(first).toEqual({ kind: "top_up", amountCents: 100000 });

    const second = planChangeFor(PLANS.platinum.depositUsdCents, held(PLANS.gold.depositUsdCents));
    expect(second).toEqual({ kind: "top_up", amountCents: 250000 });

    const transferred =
      PLANS.silver.depositUsdCents +
      (first as { amountCents: number }).amountCents +
      (second as { amountCents: number }).amountCents;
    expect(transferred).toBe(PLANS.platinum.depositUsdCents);
  });

  it("a free-tier holder pays the new tier in full — nothing was held", () => {
    // Bronze leaves a confirmed row worth $0, so `hasHistory` is true while
    // `heldCents` is 0. Reading history as "they have money with us" would
    // credit them a deposit they never made.
    expect(planChangeFor(PLANS.silver.depositUsdCents, held(0))).toEqual({
      kind: "top_up",
      amountCents: PLANS.silver.depositUsdCents,
    });
  });
});

describe("there is no self-service downgrade", () => {
  it("the tier they are already on is refused", () => {
    expect(planChangeFor(250000, held(250000))).toEqual({ kind: "not_an_upgrade" });
  });

  it("a cheaper tier is refused rather than quietly refunding the difference", () => {
    // The whole reason the design has only two client buttons: a downgrade
    // would force an answer to "refund the difference or hold it as credit",
    // and neither answer is one a page can make on its own.
    expect(planChangeFor(150000, held(250000))).toEqual({ kind: "not_an_upgrade" });
  });

  it("the free tier is refused to anyone holding money", () => {
    expect(planChangeFor(0, held(150000))).toEqual({ kind: "not_an_upgrade" });
  });

  it("re-taking the free tier is refused to a free-tier holder", () => {
    expect(planChangeFor(0, held(0))).toEqual({ kind: "not_an_upgrade" });
  });

  it("every downward pair in the catalogue is refused", () => {
    for (const from of PLAN_KEYS) {
      for (const to of PLAN_KEYS) {
        if (PLANS[to].depositUsdCents > PLANS[from].depositUsdCents) continue;
        expect(planChangeFor(PLANS[to].depositUsdCents, held(PLANS[from].depositUsdCents))).toEqual(
          { kind: "not_an_upgrade" }
        );
      }
    }
  });
});

describe("a refunded client starts over", () => {
  it("no held rows means first-timer, even after years of history", () => {
    // `hasHistory` is read over HELD rows only. A client who was refunded has
    // none, so they pay the full deposit again — the alternative is charging
    // them a difference against money we gave back.
    expect(planChangeFor(PLANS.gold.depositUsdCents, FRESH)).toEqual({
      kind: "first",
      amountCents: PLANS.gold.depositUsdCents,
    });
  });
});

describe("the amount asked for is never negative", () => {
  it("holds for every pair of tiers in the catalogue", () => {
    for (const from of PLAN_KEYS) {
      for (const to of PLAN_KEYS) {
        const change = planChangeFor(PLANS[to].depositUsdCents, held(PLANS[from].depositUsdCents));
        if (change.kind === "not_an_upgrade") continue;
        expect(change.amountCents).toBeGreaterThan(0);
        expect(change.amountCents).toBeLessThanOrEqual(PLANS[to].depositUsdCents);
      }
    }
  });
});
