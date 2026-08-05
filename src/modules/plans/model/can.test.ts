/**
 * can() is the authorization boundary for everything a plan governs, so it
 * gets the same treatment as the cost model: exhaustive tests, run in CI on
 * every push. A red test here means the rules governing real customers'
 * access and money moved — deliberately or not.
 *
 * These tests are written to survive the plan table being rewritten with
 * real numbers: they derive their expectations FROM plans.ts rather than
 * restating its figures, so filling in the real values can't silently
 * invalidate them. The handful of assertions that do hardcode something are
 * business rules, not numbers — e.g. "exactly one tier may self-bid".
 */
import { describe, expect, it } from "vitest";
import { can, type Actor } from "./can";
import { PLANS, PLAN_KEYS, type PlanKey } from "./plans";

const MID_TIER: PlanKey = "silver";

function client(overrides: Partial<Actor> = {}): Actor {
  return {
    role: "client",
    emailVerified: true,
    activePlanKey: MID_TIER,
    selfBiddingGranted: false,
    ...overrides,
  };
}

describe("gatekeeping order", () => {
  it("unverified email is refused before any plan question", () => {
    const d = can(client({ emailVerified: false, activePlanKey: null }), {
      type: "view_night_reserve",
    });
    expect(d).toEqual({ allowed: false, reason: "email_not_verified" });
  });

  it("verified but planless users are told to pick a plan", () => {
    const d = can(client({ activePlanKey: null }), { type: "view_night_reserve" });
    expect(d).toEqual({ allowed: false, reason: "no_active_plan" });
  });
});

describe("bid amount limits — derived from the plan table", () => {
  for (const key of PLAN_KEYS) {
    const cap = PLANS[key].maxBidUsd;

    if (cap === null) {
      it(`${key}: unlimited bid amount`, () => {
        const d = can(client({ activePlanKey: key }), {
          type: "place_bid_request",
          amountUsd: 10_000_000,
          activeBidCount: 0,
        });
        expect(d.allowed).toBe(true);
      });
    } else {
      it(`${key}: allows exactly $${cap}, refuses $${cap + 1}`, () => {
        const at = can(client({ activePlanKey: key }), {
          type: "place_bid_request",
          amountUsd: cap,
          activeBidCount: 0,
        });
        expect(at.allowed).toBe(true);

        const over = can(client({ activePlanKey: key }), {
          type: "place_bid_request",
          amountUsd: cap + 1,
          activeBidCount: 0,
        });
        expect(over).toEqual({ allowed: false, reason: "bid_amount_over_plan_limit" });
      });
    }
  }
});

describe("concurrent bid limits — derived from the plan table", () => {
  for (const key of PLAN_KEYS) {
    const limit = PLANS[key].maxConcurrentBids;

    if (limit === null) {
      it(`${key}: unlimited concurrency`, () => {
        const d = can(client({ activePlanKey: key }), {
          type: "place_bid_request",
          amountUsd: 1,
          activeBidCount: 500,
        });
        expect(d.allowed).toBe(true);
      });
    } else {
      it(`${key}: allows the ${limit}th bid, refuses the ${limit + 1}th`, () => {
        const under = can(client({ activePlanKey: key }), {
          type: "place_bid_request",
          amountUsd: 1,
          activeBidCount: limit - 1,
        });
        expect(under.allowed).toBe(true);

        const at = can(client({ activePlanKey: key }), {
          type: "place_bid_request",
          amountUsd: 1,
          activeBidCount: limit,
        });
        expect(at).toEqual({ allowed: false, reason: "concurrent_bid_limit_reached" });
      });
    }
  }
});

describe("night reserve and live auction visibility", () => {
  for (const key of PLAN_KEYS) {
    const plan = PLANS[key];
    it(`${key}: night reserve ${plan.nightReserveVisible ? "visible" : "hidden"}`, () => {
      const d = can(client({ activePlanKey: key }), { type: "view_night_reserve" });
      expect(d.allowed).toBe(plan.nightReserveVisible);
    });
    it(`${key}: live auction ${plan.liveAuctionAccess ? "open" : "closed"}`, () => {
      const d = can(client({ activePlanKey: key }), { type: "join_live_auction" });
      expect(d.allowed).toBe(plan.liveAuctionAccess);
    });
  }
});

describe("self-bidding: plan eligibility AND per-user grant, in that order", () => {
  const eligible = PLAN_KEYS.filter((k) => PLANS[k].selfBiddingEligible);
  const ineligible = PLAN_KEYS.filter((k) => !PLANS[k].selfBiddingEligible);

  it("exactly one tier is self-bidding eligible — widening this is a business decision, not a refactor", () => {
    expect(eligible).toHaveLength(1);
  });

  for (const key of ineligible) {
    it(`${key}: refuses even a granted user — the grant can't outrank the plan`, () => {
      const d = can(client({ activePlanKey: key, selfBiddingGranted: true }), { type: "self_bid" });
      expect(d).toEqual({ allowed: false, reason: "self_bidding_not_eligible" });
    });
  }

  for (const key of eligible) {
    it(`${key}: without the admin grant is refused — buying the top plan alone unlocks nothing`, () => {
      const d = can(client({ activePlanKey: key }), { type: "self_bid" });
      expect(d).toEqual({ allowed: false, reason: "self_bidding_not_granted" });
    });

    it(`${key}: with the grant is allowed`, () => {
      const d = can(client({ activePlanKey: key, selfBiddingGranted: true }), { type: "self_bid" });
      expect(d.allowed).toBe(true);
    });
  }
});

describe("admin", () => {
  const admin: Actor = {
    role: "admin",
    emailVerified: true,
    activePlanKey: null,
    selfBiddingGranted: false,
  };

  it("clients cannot access the admin area", () => {
    expect(can(client(), { type: "access_admin" })).toEqual({
      allowed: false,
      reason: "not_admin",
    });
  });

  it("admins can access the admin area", () => {
    expect(can(admin, { type: "access_admin" }).allowed).toBe(true);
  });

  it("admins bypass plan limits — they bid on clients' behalf", () => {
    const d = can(admin, { type: "place_bid_request", amountUsd: 1_000_000, activeBidCount: 99 });
    expect(d.allowed).toBe(true);
  });

  // Not reachable today — an unverified account cannot obtain a session, so
  // can() is never called for one. These exist so that if some future path
  // ever does create a session earlier (auto-login after registration, an
  // admin-created account, an SSO bridge), the failure is a red test rather
  // than an unverified mailbox quietly holding the deposit-approval button.
  it("an UNVERIFIED admin is refused the admin area", () => {
    expect(can({ ...admin, emailVerified: false }, { type: "access_admin" })).toEqual({
      allowed: false,
      reason: "email_not_verified",
    });
  });

  it("an UNVERIFIED admin gets no plan-limit bypass either", () => {
    const d = can(
      { ...admin, emailVerified: false },
      { type: "place_bid_request", amountUsd: 1, activeBidCount: 0 }
    );
    expect(d).toEqual({ allowed: false, reason: "email_not_verified" });
  });

  it("verification is checked before role, so the reason names the real problem", () => {
    // A client hitting /admin unverified should hear "verify your email",
    // not "not_admin" — the first is fixable, the second is a dead end.
    const d = can(client({ emailVerified: false }), { type: "access_admin" });
    expect(d).toEqual({ allowed: false, reason: "email_not_verified" });
  });
});

describe("catalogue sanity — these fail if a plans.ts edit breaks an invariant", () => {
  it("every plan has sane money fields", () => {
    for (const key of PLAN_KEYS) {
      expect(PLANS[key].depositUsdCents).toBeGreaterThanOrEqual(0);
      const fee = PLANS[key].feePerLotUsdCents;
      // null is legitimate — a fee we haven't published is absent, not zero.
      if (fee !== null) expect(fee).toBeGreaterThan(0);
    }
  });

  it("deposits strictly increase across the tier order", () => {
    const deposits = PLAN_KEYS.map((k) => PLANS[k].depositUsdCents);
    for (let i = 1; i < deposits.length; i++) {
      expect(deposits[i]).toBeGreaterThan(deposits[i - 1]);
    }
  });

  it("plan keys match their table entries", () => {
    for (const key of PLAN_KEYS) {
      expect(PLANS[key].key).toBe(key);
    }
  });

  it("only a selectable tier may be featured — no highlighting what can't be bought", () => {
    for (const key of PLAN_KEYS) {
      if (PLANS[key].featured) expect(PLANS[key].available).toBe(true);
    }
    expect(PLAN_KEYS.filter((k) => PLANS[k].featured)).toHaveLength(1);
  });

  it("at least one plan is selectable — otherwise /plans is a dead end", () => {
    expect(PLAN_KEYS.filter((k) => PLANS[k].available).length).toBeGreaterThan(0);
  });
});

/**
 * The conditional-concurrency rule ("N lots at a time, if each bid is under
 * $X") is described on the plan cards but NOT yet implemented in
 * judgeBidRequest. That is safe only while every plan carrying a threshold is
 * unavailable. This test is the tripwire: flipping such a plan to available
 * without implementing the rule turns it red, instead of silently letting a
 * paying customer hold five $50,000 bids the plan never promised.
 */
describe("conditional concurrency is not yet enforced", () => {
  it("no AVAILABLE plan carries an unenforced concurrency threshold", () => {
    const offenders = PLAN_KEYS.filter(
      (k) => PLANS[k].available && PLANS[k].concurrencyThresholdUsd !== null
    );
    expect(offenders).toEqual([]);
  });
});
