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

/** What every plan says: bidding power, concurrency, human support. */
export function planCoreLines(plan: Plan, t: Translate): string[] {
  return [
    plan.maxBidUsd === null
      ? t("features.bidUnlimited")
      : t("features.bidLimit", { amount: formatUsd(plan.maxBidUsd * 100) }),
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
