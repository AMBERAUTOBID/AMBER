/**
 * How much of a security deposit a bid instruction needs.
 *
 * ── THE BUSINESS RULE, IN THE OWNER'S WORDS ─────────────────────────────
 * The free tier exists for someone buying one or two cars; anybody buying
 * regularly should be on a deposit plan. So a free-tier client is judged per
 * car, by a person, after a call — and this function produces the number that
 * conversation starts from, not the number it must end at. An admin may always
 * reduce or waive it (password-confirmed; see `depositOverrideNeedsPassword`).
 *
 * ── WHY IT STOPS AT $10,000 ─────────────────────────────────────────────
 * Above that the answer is a plan, not a bigger hold, and the plan table says
 * so itself:
 *
 *     Silver    max bid $15,000   deposit $1,500   = exactly 10%
 *     Gold      max bid $25,000   deposit $2,500   = exactly 10%
 *     Platinum  max bid $50,000   deposit $5,000   = exactly 10%
 *
 * The tier deposits ALREADY ARE ten percent of what they let you bid. So above
 * $10,000 a per-car deposit and a tier cost the same money — and the tier
 * covers every car instead of one. Charging the same for less would be a worse
 * deal that we invented for no reason.
 *
 * That also puts the upgrade conversation exactly where the owner said it
 * belongs: at the point where somebody stops being a one-car buyer.
 *
 * ✅ Silver used to be the exception that proved the rule — $1,500 on a
 * $10,000 cap is 15%, not 10% — and it stopped being one when the owner raised
 * that cap to $15,000 on 2026-08-17. All three deposit tiers now sit on the
 * same ten-percent line, so the band above genuinely is "a tier costs the same
 * as the hold" rather than "the same, except for the cheapest tier".
 */
import { PLANS, PLAN_KEYS, type PlanKey } from "@/modules/plans/model/plans";

/**
 * No deposit at or below this bid. USD cents. Owner's figure, 2026-08-14.
 *
 * ⚠️ READ FROM THE PLAN TABLE RATHER THAN WRITTEN OUT, and that is new as of
 * 2026-08-17. The same $5,000 is now the headline limit on the free card, so
 * the two had to become one number: a hand-written constant here and a card
 * line over there is precisely how a pricing page starts promising something
 * the code does not do. `plans.ts` is the single place; this reads it.
 */
export const DEPOSIT_FREE_AT_OR_BELOW_CENTS = (PLANS.bronze.depositFreeUpToUsd ?? 0) * 100;

/** Above this, the answer is a plan rather than a bigger hold. USD cents. */
export const PER_CAR_DEPOSIT_CEILING_CENTS = 1_000_000; // $10,000

/** Ten percent, expressed so the arithmetic stays in integer cents. */
export const DEPOSIT_PERMILLE = 100; // 100‰ of a thousand = 10%

export type BidDeposit =
  /** Small enough that a hold would cost more to administer than it protects. */
  | { kind: "none" }
  /** A hold against this one car. */
  | { kind: "per_car"; cents: number }
  /**
   * Too big for a per-car hold. The named tier costs the same or less and
   * covers everything — so we quote the tier instead.
   */
  | { kind: "needs_plan"; planKey: PlanKey; cents: number }
  /**
   * Beyond every tier we sell. Not refused here — a person decides — but it
   * must never be quoted a number automatically.
   */
  | { kind: "beyond_tiers" };

/**
 * The cheapest available tier whose bidding cap covers this amount.
 *
 * Derived from the plan table rather than written out, so adding or repricing
 * a tier moves this with it. Plans that take **no deposit** are skipped:
 * "the cheapest plan that covers $30,000" must not answer "the free one".
 *
 * ⚠️ THAT EXCLUSION USED TO BE `maxBidUsd !== null`, AND IT WAS RIGHT ONLY BY
 * ACCIDENT. It kept Bronze out because Bronze happened to be uncapped — so the
 * moment Bronze was given a real $10,000 cap (to stop the free plan
 * out-promising Platinum on /plans), the guard excluded nothing and Bronze, at
 * a $0 deposit, would have won the cheapest-tier reduce outright. The property
 * that matters was never the cap; it is whether the plan takes a deposit at
 * all. Saying so directly makes this independent of what any tier's limits
 * happen to become next.
 */
export function tierCovering(amountCents: number): PlanKey | null {
  const candidates = PLAN_KEYS.filter((key) => {
    const plan = PLANS[key];
    return (
      plan.available &&
      plan.depositUsdCents > 0 &&
      plan.maxBidUsd !== null &&
      plan.maxBidUsd * 100 >= amountCents
    );
  });
  if (candidates.length === 0) return null;
  return candidates.reduce((cheapest, key) =>
    PLANS[key].depositUsdCents < PLANS[cheapest].depositUsdCents ? key : cheapest
  );
}

/**
 * What to ask for, given the bid the client wants to authorise.
 *
 * Only ever called for clients on a **deposit-free** plan. Somebody who
 * already holds a tier has posted their security once and does not post it
 * again per car — that is the whole thing the tier bought them, and charging
 * twice would make the tiers worth less than the free plan.
 */
export function bidDepositFor(maxBidCents: number): BidDeposit {
  if (maxBidCents <= DEPOSIT_FREE_AT_OR_BELOW_CENTS) return { kind: "none" };

  if (maxBidCents <= PER_CAR_DEPOSIT_CEILING_CENTS) {
    // Rounded to whole dollars: a hold quoted as $712.34 invites a question
    // about the 34 cents that nobody benefits from answering.
    const raw = Math.round((maxBidCents * DEPOSIT_PERMILLE) / 1000);
    return { kind: "per_car", cents: Math.round(raw / 100) * 100 };
  }

  const planKey = tierCovering(maxBidCents);
  if (!planKey) return { kind: "beyond_tiers" };
  return { kind: "needs_plan", planKey, cents: PLANS[planKey].depositUsdCents };
}

/**
 * Whether changing the deposit to `proposedCents` needs the admin's password.
 *
 * **Only the direction that increases our risk is guarded.** Lowering or
 * waiving a hold is the decision worth slowing down; raising one is somebody
 * being careful and should cost them nothing. Asking for a password on every
 * change is how people learn to type it without reading the screen, which is
 * the failure the password was there to prevent.
 */
export function depositOverrideNeedsPassword(
  defaultCents: number,
  proposedCents: number
): boolean {
  return proposedCents < defaultCents;
}
