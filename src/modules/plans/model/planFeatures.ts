/**
 * Plan feature lines, generated from the plan table.
 *
 * The rule this file exists to keep (ARCHITECTURE.md §6): no screen may
 * describe a limit in prose. Every line here is derived from `plans.ts`, so a
 * card, a dialog and the account page cannot advertise a cap that `can()`
 * doesn't enforce — the classic way a pricing page starts lying.
 *
 * It was previously written out inline in PlanCard and again in
 * PlanConfirmDialog, and the two had already diverged: the dialog rendered
 * Gold as "bid on 2 lots at a time" and dropped the "(if each bid is under
 * $10,000)" condition the card showed. That is the whole argument for one
 * copy.
 *
 * The lines are split rather than returned as one list because the dialog
 * styles fees differently from the rest — it emphasises them, since the fee
 * is what the client is actually agreeing to.
 */
import { formatUsd, type Plan } from "./plans";

/**
 * Structurally what both `useTranslations()` and `getTranslations()` return.
 * Typed here rather than imported so this module stays free of `next/*` and
 * works on either side of the server/client line.
 */
type Translate = (key: string, values?: Record<string, string | number>) => string;

/**
 * How a tier states its bidding power — one line for a deposit tier, two for
 * the free one.
 *
 * ⚠️ THE FREE TIER HAS TWO LIMITS, NOT ONE, AND COLLAPSING THEM MISSTATES THE
 * OFFER. `maxBidUsd` is the hard ceiling above which no bid is accepted at
 * all; `depositFreeUpToUsd` is where we stop asking for security. Between them
 * sits a band where a person looks at the car and decides. Printing only the
 * ceiling promised $10,000 with no mention of a hold; printing only the free
 * line would read as a refusal above $5,000. Both are true, so both are said —
 * and both come from the table `bidDepositFor()` actually enforces.
 */
function biddingPowerLines(plan: Plan, t: Translate): string[] {
  if (plan.maxBidUsd === null) return [t("features.bidUnlimited")];
  const ceiling = formatUsd(plan.maxBidUsd * 100);
  if (plan.depositFreeUpToUsd === null) return [t("features.bidLimit", { amount: ceiling })];
  const free = formatUsd(plan.depositFreeUpToUsd * 100);
  return [
    t("features.bidFreeUpTo", { amount: free }),
    t("features.bidDecidedTogether", { from: free, to: ceiling }),
  ];
}

/** What every plan says: bidding power, concurrency, human support. */
export function planCoreLines(plan: Plan, t: Translate): string[] {
  return [
    ...biddingPowerLines(plan, t),
    plan.maxConcurrentBids === null
      ? t("features.concurrentUnlimited")
      : plan.concurrencyThresholdUsd !== null
        ? t("features.concurrentConditional", {
            count: plan.maxConcurrentBids,
            threshold: formatUsd(plan.concurrencyThresholdUsd * 100),
          })
        : t("features.concurrent", { count: plan.maxConcurrentBids }),
    t("features.consultant"),
  ];
}

/** One line per published fee. An empty list renders nothing — invariant #5:
 * an unpublished fee is absent, never zero. */
export function planFeeLines(plan: Plan, t: Translate): string[] {
  return plan.feesPerVehicleUsdCents.map((cents) => t("features.fee", { amount: formatUsd(cents) }));
}

/** Perks a tier either has or doesn't. */
export function planExtraLines(plan: Plan, t: Translate): string[] {
  return [
    ...(plan.nightReserveVisible ? [t("features.nightReserve")] : []),
    ...(plan.liveAuctionAccess ? [t("features.liveAuction")] : []),
    ...(plan.selfBiddingEligible ? [t("features.selfBidding")] : []),
  ];
}

/** Everything, in card order. */
export function planFeatureLines(plan: Plan, t: Translate): string[] {
  return [...planCoreLines(plan, t), ...planFeeLines(plan, t), ...planExtraLines(plan, t)];
}
