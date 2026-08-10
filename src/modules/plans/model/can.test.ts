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
          activeBidsUsd: [],
        });
        expect(d.allowed).toBe(true);
      });
    } else {
      it(`${key}: allows exactly $${cap}, refuses $${cap + 1}`, () => {
        const at = can(client({ activePlanKey: key }), {
          type: "place_bid_request",
          amountUsd: cap,
          activeBidsUsd: [],
        });
        expect(at.allowed).toBe(true);

        const over = can(client({ activePlanKey: key }), {
          type: "place_bid_request",
          amountUsd: cap + 1,
          activeBidsUsd: [],
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
          activeBidsUsd: new Array(500).fill(1),
        });
        expect(d.allowed).toBe(true);
      });
    } else {
      it(`${key}: allows the ${limit}th bid, refuses the ${limit + 1}th`, () => {
        // Amounts of 1 keep every plan's conditional threshold out of the way,
        // so this test measures the plain count and nothing else.
        const under = can(client({ activePlanKey: key }), {
          type: "place_bid_request",
          amountUsd: 1,
          activeBidsUsd: new Array(limit - 1).fill(1),
        });
        expect(under.allowed).toBe(true);

        const at = can(client({ activePlanKey: key }), {
          type: "place_bid_request",
          amountUsd: 1,
          activeBidsUsd: new Array(limit).fill(1),
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

  it("at most one tier is self-bidding eligible — widening this is a business decision, not a refactor", () => {
    // Currently ZERO, deliberately: self-bidding needs the broker account that
    // issues per-client access codes, so Platinum's flag was turned off rather
    // than have a $5,000 tier advertise it. This used to assert exactly one.
    // The danger it guards has not changed and is not "one versus none" — it
    // is a second tier quietly acquiring the most powerful thing a plan can
    // grant, which is why the ceiling stays.
    expect(eligible.length).toBeLessThanOrEqual(1);
  });

  it("no tier grants self-bidding on the plan alone — the admin grant is always required", () => {
    // Holds at zero eligible tiers too, which is the point: the assertion is
    // about the SHAPE of the rule, so it keeps working when Platinum is
    // switched back on and would fail the moment the grant stopped mattering.
    for (const key of PLAN_KEYS) {
      const d = can(client({ activePlanKey: key, selfBiddingGranted: false }), { type: "self_bid" });
      expect(d.allowed).toBe(false);
    }
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

/**
 * Saving a favourite. The rule is "any plan will do", which makes it look too
 * trivial to test — and that is exactly why it is tested. The behaviour that
 * matters is at the edges, not the middle:
 *
 * - a planless client must be refused, because saving is the thing an
 *   approved account gets;
 * - but only *saving* goes through can(). Reading the list deliberately does
 *   not, so a client whose deposit is refunded keeps their collection. There
 *   is no "read_favorites" action, and its absence is a decision — if one
 *   ever appears, this comment is where to argue about it.
 */
describe("saving favourites", () => {
  for (const key of PLAN_KEYS) {
    it(`${key}: any active plan may save`, () => {
      expect(can(client({ activePlanKey: key }), { type: "save_favorite" })).toEqual({
        allowed: true,
      });
    });
  }

  it("a verified client with no plan is refused, and told why", () => {
    expect(can(client({ activePlanKey: null }), { type: "save_favorite" })).toEqual({
      allowed: false,
      reason: "no_active_plan",
    });
  });

  it("an unverified email is refused before the plan is even considered", () => {
    expect(
      can(client({ emailVerified: false, activePlanKey: null }), { type: "save_favorite" })
    ).toEqual({ allowed: false, reason: "email_not_verified" });
  });

  it("admins may save without holding a plan", () => {
    expect(
      can(client({ role: "admin", activePlanKey: null }), { type: "save_favorite" })
    ).toEqual({ allowed: true });
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
    const d = can(admin, {
      type: "place_bid_request",
      amountUsd: 1_000_000,
      activeBidsUsd: new Array(99).fill(1_000_000),
    });
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
      { type: "place_bid_request", amountUsd: 1, activeBidsUsd: [] }
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
      // An empty list is legitimate — a fee we haven't published is absent,
      // not zero. Any fee that IS listed must be a real amount.
      for (const fee of PLANS[key].feesPerVehicleUsdCents) {
        expect(fee).toBeGreaterThan(0);
      }
    }
  });

  it("the only selectable plan quotes at least one fee — it's how we get paid", () => {
    for (const key of PLAN_KEYS) {
      if (PLANS[key].available) {
        expect(PLANS[key].feesPerVehicleUsdCents.length).toBeGreaterThan(0);
      }
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
 * The conditional-concurrency rule — "N lots at a time, when each bid is under
 * $X". This used to be a tripwire asserting that no AVAILABLE plan carried an
 * unenforced threshold, which held only while every such tier was locked.
 * Opening them is what the tripwire was waiting for, so it is replaced by the
 * enforcement it was standing in for.
 *
 * The case worth keeping in mind is the last one: "each bid" includes the
 * bids already live. A rule that read only the incoming amount would let a
 * client drift over the threshold one small bid at a time.
 */
describe("conditional concurrency — the allowance depends on bid size", () => {
  const conditional = PLAN_KEYS.filter(
    (k) => PLANS[k].concurrencyThresholdUsd !== null && PLANS[k].maxConcurrentBids !== null
  );

  it("some tier actually uses the rule — otherwise these tests prove nothing", () => {
    expect(conditional.length).toBeGreaterThan(0);
  });

  for (const key of conditional) {
    const plan = PLANS[key];
    const limit = plan.maxConcurrentBids!;
    const threshold = plan.concurrencyThresholdUsd!;

    it(`${key}: under the threshold, the full allowance of ${limit} applies`, () => {
      const d = can(client({ activePlanKey: key }), {
        type: "place_bid_request",
        amountUsd: threshold,
        activeBidsUsd: new Array(limit - 1).fill(threshold),
      });
      expect(d.allowed).toBe(true);
    });

    it(`${key}: a bid over $${threshold} is allowed, but only as the only one`, () => {
      const alone = can(client({ activePlanKey: key }), {
        type: "place_bid_request",
        amountUsd: threshold + 1,
        activeBidsUsd: [],
      });
      expect(alone.allowed).toBe(true);

      const second = can(client({ activePlanKey: key }), {
        type: "place_bid_request",
        amountUsd: threshold + 1,
        activeBidsUsd: [1],
      });
      expect(second).toEqual({ allowed: false, reason: "concurrent_bid_limit_reached" });
    });

    it(`${key}: a small bid is refused while a bid over $${threshold} is already live`, () => {
      // The drift case. Judged on the incoming amount alone this reads as a
      // $1 bid against an allowance of ${limit} and sails through, leaving the
      // client holding a set the plan never promised.
      const d = can(client({ activePlanKey: key }), {
        type: "place_bid_request",
        amountUsd: 1,
        activeBidsUsd: [threshold + 1],
      });
      expect(d).toEqual({ allowed: false, reason: "concurrent_bid_limit_reached" });
    });
  }
});

/**
 * Availability is a commercial state, and these assert the shape it must keep
 * rather than which tiers happen to be open today.
 */
describe("what an available tier is allowed to claim", () => {
  it("no available tier advertises a feature this site cannot perform", () => {
    // Both flags describe SOFTWARE — a reserve-price display and a
    // per-client self-bidding code — neither of which exists. The bidding
    // caps are excluded on purpose: those are commercial terms honoured by
    // hand, and honouring them by hand is what we sell. See plans.ts.
    for (const key of PLAN_KEYS) {
      if (!PLANS[key].available) continue;
      expect(PLANS[key].nightReserveVisible).toBe(false);
      expect(PLANS[key].selfBiddingEligible).toBe(false);
    }
  });

  it("every deposit tier charges less per vehicle than the free one", () => {
    // The entire reason to pay a deposit. If this ever inverts, the offer has
    // no shape and nobody should be able to ship it quietly.
    const free = PLANS[PLAN_KEYS.find((k) => PLANS[k].depositUsdCents === 0)!];
    const freeFee = Math.min(...free.feesPerVehicleUsdCents);
    for (const key of PLAN_KEYS) {
      if (PLANS[key].depositUsdCents === 0) continue;
      expect(Math.min(...PLANS[key].feesPerVehicleUsdCents)).toBeLessThan(freeFee);
    }
  });
});
