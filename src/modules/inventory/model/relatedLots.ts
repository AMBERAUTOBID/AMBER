import type { VehicleListItem } from "../api/types";

/**
 * Is this lot genuinely still going to auction?
 *
 * Exists because the "similar lots in upcoming auctions" block was showing cars
 * that had already sold. MEASURED 2026-08-12 over three seed lots: **36 of 36**
 * entries in the aggregator's `related.upcoming` were finished and sold, with
 * sale dates in February and March. Not a leak — the array carried nothing else.
 *
 * The payload is not lying about the lots, only about the heading: every one of
 * those entries reported `state: "finished"`, a negative `diff_minutes` and a
 * `last_sold_status` of its own. So the fields ARE trustworthy here, unlike on a
 * search list response (see the batch-stamp note on `VehicleListItem.auction`),
 * and filtering on them is honest rather than cosmetic.
 *
 * All three signals are checked because they are computed independently and any
 * one of them can be absent: our own mirrored rows, for instance, carry a real
 * sale instant and deliberately no `state` at all.
 *
 * `now` is a parameter so this stays pure and testable; callers pass nothing.
 */
export function isStillUpcoming(vehicle: VehicleListItem, now: Date = new Date()): boolean {
  const auction = vehicle.auction;
  if (!auction) return false;

  if (auction.state === "finished") return false;
  if (typeof auction.diff_minutes === "number" && auction.diff_minutes <= 0) return false;

  const stamp = auction.full_date ?? auction.auction_at ?? null;
  if (!stamp) return false;
  const at = Date.parse(stamp);
  // An unparseable date is not evidence of a future sale. A block that promises
  // upcoming auctions has to earn each card it shows, so anything it cannot
  // vouch for is dropped rather than displayed.
  if (!Number.isFinite(at)) return false;

  return at > now.getTime();
}
