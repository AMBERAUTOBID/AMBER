/**
 * can() is the authorization boundary for everything a plan governs, so it
 * gets the same treatment as the cost model: exhaustive tests, run in CI on
 * every push. A red test here means the rules governing real customers'
 * access and money moved — deliberately or not.
 */
import { describe, expect, it } from "vitest";
import { can, type Actor } from "./can";
import { PLANS, PLAN_KEYS, type PlanKey } from "./plans";

function client(overrides: Partial<Actor> = {}): Actor {
  return {
    role: "client",
    emailVerified: true,
    activePlanKey: "standard",
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

describe("bid amount limits per plan", () => {
  // [plan, a bid the plan must allow, a bid it must refuse (null = unlimited)]
  const cases: Array<[PlanKey, number, number | null]> = [
    ["starter", 999_999, null],
    ["minimal", 5_000, 5_001],
    ["standard", 15_000, 15_001],
    ["premium", 30_000, 30_001],
    ["professional", 999_999, null],
  ];

  for (const [plan, okAmount, overAmount] of cases) {
    it(`${plan}: allows $${okAmount}`, () => {
      const d = can(client({ activePlanKey: plan }), {
        type: "place_bid_request",
        amountUsd: okAmount,
        activeBidCount: 0,
      });
      expect(d.allowed).toBe(true);
    });

    if (overAmount !== null) {
      it(`${plan}: refuses $${overAmount}`, () => {
        const d = can(client({ activePlanKey: plan }), {
          type: "place_bid_request",
          amountUsd: overAmount,
          activeBidCount: 0,
        });
        expect(d).toEqual({ allowed: false, reason: "bid_amount_over_plan_limit" });
      });
    }
  }

  it("a bid exactly at the limit is allowed — the limit is inclusive", () => {
    const d = can(client({ activePlanKey: "minimal" }), {
      type: "place_bid_request",
      amountUsd: PLANS.minimal.maxBidUsd!,
      activeBidCount: 0,
    });
    expect(d.allowed).toBe(true);
  });
});

describe("concurrent bid limits per plan", () => {
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
  it("ineligible plan refuses even a granted user — the grant can't outrank the plan", () => {
    const d = can(client({ activePlanKey: "standard", selfBiddingGranted: true }), {
      type: "self_bid",
    });
    expect(d).toEqual({ allowed: false, reason: "self_bidding_not_eligible" });
  });

  it("eligible plan without the admin grant is refused — buying the top plan alone unlocks nothing", () => {
    const d = can(client({ activePlanKey: "professional" }), { type: "self_bid" });
    expect(d).toEqual({ allowed: false, reason: "self_bidding_not_granted" });
  });

  it("eligible plan plus the grant is allowed", () => {
    const d = can(client({ activePlanKey: "professional", selfBiddingGranted: true }), {
      type: "self_bid",
    });
    expect(d.allowed).toBe(true);
  });

  it("exactly one plan is self-bidding eligible — widening this is a business decision, not a refactor", () => {
    const eligible = PLAN_KEYS.filter((k) => PLANS[k].selfBiddingEligible);
    expect(eligible).toEqual(["professional"]);
  });
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
});

describe("catalogue sanity — these fail if a plans.ts edit breaks an invariant", () => {
  it("every plan has non-negative money fields", () => {
    for (const key of PLAN_KEYS) {
      expect(PLANS[key].depositCents).toBeGreaterThanOrEqual(0);
      expect(PLANS[key].feePerLotCents).toBeGreaterThan(0);
    }
  });

  it("deposits strictly increase across the tier order", () => {
    const deposits = PLAN_KEYS.map((k) => PLANS[k].depositCents);
    for (let i = 1; i < deposits.length; i++) {
      expect(deposits[i]).toBeGreaterThan(deposits[i - 1]);
    }
  });

  it("plan keys match their table entries", () => {
    for (const key of PLAN_KEYS) {
      expect(PLANS[key].key).toBe(key);
    }
  });
});
