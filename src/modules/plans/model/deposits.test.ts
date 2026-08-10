/**
 * The availability guard in requestPlan().
 *
 * These run without a database on purpose: the guard deliberately sits
 * BEFORE any query, so a plan we cannot service is refused without touching
 * the deposit table at all. That ordering is the thing under test — if
 * someone later moves the check below the insert, or drops it because "the
 * UI already hides those buttons", these fail.
 *
 * Why it matters: a tier the site cannot service is hidden by presentation —
 * a Coming Soon badge and no select button. A crafted POST to
 * /api/plans/request is not presentation, and must not be able to put such a
 * plan into the admin's deposit queue looking real.
 */
import { describe, expect, it } from "vitest";
import { requestPlan } from "./deposits";
import { PLANS, PLAN_KEYS, isSelectable, type PlanKey } from "./plans";

const SOME_USER = "00000000-0000-0000-0000-000000000000";

describe("requestPlan refuses unavailable plans before touching the database", () => {
  /**
   * ⚠️ The fixture is MADE, not found.
   *
   * This suite used to pick a locked tier out of the catalogue, guarded by an
   * assertion that one existed. The day all four tiers opened, that assertion
   * was the only thing that failed — the guard itself went untested, and
   * "delete the failing assertion" would have been the obvious fix and the
   * wrong one. A test of a guard must not depend on commercial state that can
   * legitimately change; so one tier is made unavailable here and put back
   * afterwards.
   */
  const VICTIM: PlanKey = PLAN_KEYS[PLAN_KEYS.length - 1]!;

  it(`${VICTIM}: returns "unavailable" with no DB access`, async () => {
    const original = PLANS[VICTIM].available;
    PLANS[VICTIM].available = false;
    try {
      // No database is configured in the test environment. If the guard were
      // removed or moved after the first query, this would throw a
      // DATABASE_URL error instead of resolving — which is exactly the
      // regression we want to catch.
      await expect(requestPlan(SOME_USER, VICTIM)).resolves.toEqual({ status: "unavailable" });
    } finally {
      PLANS[VICTIM].available = original;
    }
  });

  it("puts the tier back, so the order tests run in cannot matter", () => {
    expect(PLANS[VICTIM].available).toBe(true);
  });
});

describe("isSelectable mirrors the catalogue", () => {
  for (const key of PLAN_KEYS) {
    it(`${key}: ${PLANS[key].available ? "selectable" : "locked"}`, () => {
      expect(isSelectable(key)).toBe(PLANS[key].available);
    });
  }

  it("exactly the plans marked available are selectable", () => {
    const selectable = PLAN_KEYS.filter((k: PlanKey) => isSelectable(k));
    const available = PLAN_KEYS.filter((k) => PLANS[k].available);
    expect(selectable).toEqual(available);
  });
});
