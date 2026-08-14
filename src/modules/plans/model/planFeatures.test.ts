/**
 * Feature lines are generated from the plan table, never written per screen.
 *
 * This suite exists because they used to be written twice — inline in
 * PlanCard and again in PlanConfirmDialog — and the copies had already
 * diverged: the dialog rendered Gold as "bid on 2 lots at a time" and
 * silently dropped the "(if each bid is under $10,000)" condition that makes
 * the sentence true. A customer read a different allowance depending on which
 * component they were looking at.
 *
 * So the assertions here are about the mapping from catalogue to prose: every
 * plan produces lines, and every line that describes a limit actually carries
 * that limit's numbers. A translator stub stands in for next-intl, which
 * keeps this free of both the DB and the message files.
 */
import { describe, expect, it } from "vitest";
import { PLANS, PLAN_KEYS, formatUsd } from "./plans";
import { planCoreLines, planFeeLines, planExtraLines, planFeatureLines } from "./planFeatures";

/** Renders "key(a=1, b=2)" so a test can assert on key AND interpolations. */
function stubTranslator(key: string, values?: Record<string, string | number>): string {
  if (!values) return key;
  const args = Object.entries(values)
    .map(([k, v]) => `${k}=${v}`)
    .join(", ");
  return `${key}(${args})`;
}

describe("every plan produces a complete set of lines", () => {
  for (const key of PLAN_KEYS) {
    it(`${key}: core lines cover bidding power, concurrency and support`, () => {
      const lines = planCoreLines(PLANS[key], stubTranslator);
      expect(lines).toHaveLength(3);
      expect(lines.every((l) => l.length > 0)).toBe(true);
    });

    it(`${key}: one fee line per published fee, and no more`, () => {
      expect(planFeeLines(PLANS[key], stubTranslator)).toHaveLength(
        PLANS[key].feesPerVehicleUsdCents.length
      );
    });

    it(`${key}: the full list is core + fees + extras`, () => {
      const plan = PLANS[key];
      expect(planFeatureLines(plan, stubTranslator)).toEqual([
        ...planCoreLines(plan, stubTranslator),
        ...planFeeLines(plan, stubTranslator),
        ...planExtraLines(plan, stubTranslator),
      ]);
    });
  }
});

describe("lines carry the catalogue's actual numbers", () => {
  it("a capped plan states its cap", () => {
    const capped = PLAN_KEYS.map((k) => PLANS[k]).find((p) => p.maxBidUsd !== null);
    expect(capped, "no capped plan in the catalogue — this suite proves nothing").toBeDefined();
    expect(planCoreLines(capped!, stubTranslator)[0]).toBe(
      `features.bidLimit(amount=${formatUsd(capped!.maxBidUsd! * 100)})`
    );
  });

  /**
   * ⚠️ THE CATALOGUE MUST NOT CONTAIN AN UNCAPPED TIER, and this is the test
   * that says so — it used to require the opposite.
   *
   * Bronze carried `maxBidUsd: null` and `maxConcurrentBids: null`, which the
   * card rendered as "unlimited bidding power" and "unlimited concurrent bids".
   * The free plan therefore advertised more than Platinum at $5,000, and the
   * page argued against its own price list. `null` had never been a promise —
   * it meant only that every Bronze bid passes through us by hand, so there was
   * nothing to enforce — but a client reads a card, not a data model.
   *
   * So the invariant flipped: every tier states a real limit.
   */
  it("no tier is uncapped — an unlimited free plan out-promises the paid ones", () => {
    const uncapped = PLAN_KEYS.map((k) => PLANS[k]).filter(
      (p) => p.maxBidUsd === null || p.maxConcurrentBids === null
    );
    expect(uncapped.map((p) => p.key)).toEqual([]);
  });

  /**
   * The unlimited branch is now unreachable from the catalogue, so it is
   * exercised directly. Keeping it covered is deliberate: the type still admits
   * `null`, and a tier added later with an open cap must still render as words
   * rather than as "$null".
   */
  it("still renders an uncapped plan as unlimited rather than a number", () => {
    const uncapped = { ...PLANS.bronze, maxBidUsd: null, maxConcurrentBids: null };
    const lines = planCoreLines(uncapped, stubTranslator);
    expect(lines[0]).toBe("features.bidUnlimited");
    expect(lines[1]).toBe("features.concurrentUnlimited");
  });

  /**
   * The exact regression that motivated the extraction. A plan whose
   * concurrency allowance shrinks above a threshold must say so — stating the
   * count alone advertises an allowance the client doesn't have.
   */
  it("a conditional concurrency allowance states its threshold", () => {
    const conditional = PLAN_KEYS.map((k) => PLANS[k]).find(
      (p) => p.concurrencyThresholdUsd !== null && p.maxConcurrentBids !== null
    );
    expect(
      conditional,
      "no plan carries a concurrency threshold — the drift this guards can't recur"
    ).toBeDefined();
    expect(planCoreLines(conditional!, stubTranslator)[1]).toBe(
      `features.concurrentConditional(count=${conditional!.maxConcurrentBids}, ` +
        `threshold=${formatUsd(conditional!.concurrencyThresholdUsd! * 100)})`
    );
  });
});

describe("extras appear only for the plans that have them", () => {
  for (const key of PLAN_KEYS) {
    it(`${key}: matches the catalogue flags exactly`, () => {
      const plan = PLANS[key];
      const lines = planExtraLines(plan, stubTranslator);
      expect(lines.includes("features.nightReserve")).toBe(plan.nightReserveVisible);
      expect(lines.includes("features.liveAuction")).toBe(plan.liveAuctionAccess);
      expect(lines.includes("features.selfBidding")).toBe(plan.selfBiddingEligible);
    });
  }
});
