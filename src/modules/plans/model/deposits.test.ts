/**
 * The availability guard in requestPlan().
 *
 * These run without a database on purpose: the guard deliberately sits
 * BEFORE any query, so a plan we cannot service is refused without touching
 * the deposit table at all. That ordering is the thing under test — if
 * someone later moves the check below the insert, or drops it because "the
 * UI already hides those buttons", these fail.
 *
 * Why it matters: /plans renders Silver, Gold and Platinum as Coming Soon
 * with a Contact link and no select button. That is presentation. A crafted
 * POST to /api/plans/request is not, and must not be able to put a plan we
 * have no auction access for into the admin's deposit queue looking real.
 */
import { describe, expect, it } from "vitest";
import { requestPlan } from "./deposits";
import { PLANS, PLAN_KEYS, isSelectable, type PlanKey } from "./plans";

const SOME_USER = "00000000-0000-0000-0000-000000000000";

describe("requestPlan refuses unavailable plans before touching the database", () => {
  const locked = PLAN_KEYS.filter((k) => !PLANS[k].available);

  it("there is at least one locked plan to guard (else this suite proves nothing)", () => {
    expect(locked.length).toBeGreaterThan(0);
  });

  for (const key of locked) {
    it(`${key}: returns "unavailable" with no DB access`, async () => {
      // No database is configured in the test environment. If the guard were
      // removed or moved after the first query, this would throw a
      // DATABASE_URL error instead of resolving — which is exactly the
      // regression we want to catch.
      await expect(requestPlan(SOME_USER, key)).resolves.toEqual({ status: "unavailable" });
    });
  }
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
