import type { VehicleListItem } from "../api/types";

/**
 * The sale instant of a lot in a LIST, but only when it is this lot's own.
 *
 * A countdown on a result card is worth having and dangerous to guess at, and
 * the two sources answer differently:
 *
 *  - **Our mirrored rows** carry a real per-lot `full_date` taken from the
 *    ingested `sale_date` column, and deliberately no `state` and no
 *    `diff_minutes` — mirrorLot.ts omits them rather than inventing them.
 *  - **The aggregator's list responses batch-stamp `state` and `diff_minutes`**:
 *    measured, every row of a 20-row page carried identical values, including a
 *    lot whose detail endpoint had reported it finished 147 days earlier. See
 *    the note on `VehicleListItem.auction`.
 *
 * So the presence of those two fields is itself the tell that this row's timing
 * is a page-level stamp rather than a fact about the car. A grid of twenty-four
 * cards all counting down to the same minute would be worse than no countdown
 * at all: it looks authoritative and is wrong for most of them.
 *
 * Returns null whenever we cannot vouch for the instant — no auction block, a
 * stamped row, no date, an unparseable one, or a sale already past. The caller
 * renders nothing, which is the honest answer.
 */
export function ownSaleInstant(vehicle: VehicleListItem, now: Date = new Date()): string | null {
  const auction = vehicle.auction;
  if (!auction) return null;
  if (auction.state !== undefined || auction.diff_minutes !== undefined) return null;

  const stamp = auction.full_date ?? auction.auction_at ?? null;
  if (!stamp) return null;

  const at = Date.parse(stamp);
  if (!Number.isFinite(at) || at <= now.getTime()) return null;

  return stamp;
}
