"use client";

import RangeSlider from "./RangeSlider";

export const RETAIL_MIN = 0;
/**
 * The top stop, in whole dollars.
 *
 * MEASURED over the 116,737 upcoming lots that carry an estimated retail value:
 * p05 $1,600, p25 $5,175, median $10,250, p75 $18,953, p95 $38,400, p99 $66,625.
 * A stop at 50,000 puts the median at a fifth of the track and the whole
 * interquartile range across its first third, which is where people shop; the
 * `+` keeps the Range Rovers and the low-mileage pickups above it reachable.
 */
export const RETAIL_MAX = 50000;
/** $1,000 — fine enough to separate a $4,000 car from a $6,000 one, coarse
 * enough that dragging the thumb does not feel like tuning a radio. */
const RETAIL_STEP = 1000;

function formatDollars(value: number, atCeiling: boolean) {
  return `$${value.toLocaleString("en-US")}${atCeiling ? "+" : ""}`;
}

/**
 * Estimated retail value, and it is labelled as such rather than as "price".
 *
 * WHY NOT THE BID: the current bid is what someone has offered so far, and its
 * median across upcoming lots is $225 — an opening bid on a salvage car that
 * will sell for thousands. Filtering "up to $1,000" on it would return cars that
 * go for $8,000. It is present on 34.6% of lots against 88.0% for this field.
 *
 * WHY NOT "PRICE": this is what the car is worth retail in the US, not what the
 * buyer will pay — that number does not exist until the auction ends, and the
 * cost calculator adds fees, shipping and duty on top. Calling it "price" would
 * promise a total this figure cannot give. bidauto.online calls their version
 * "Price New", which says nothing at all about which number it means.
 */
export default function RetailRange({
  min,
  max,
  onChange,
  title,
  resetLabel,
}: {
  min: number;
  max: number;
  onChange: (min: number, max: number) => void;
  title: string;
  resetLabel: string;
}) {
  return (
    <RangeSlider
      min={min}
      max={max}
      floor={RETAIL_MIN}
      ceiling={RETAIL_MAX}
      step={RETAIL_STEP}
      format={formatDollars}
      onChange={onChange}
      title={title}
      resetLabel={resetLabel}
      minAriaLabel="Minimum estimated retail value"
      maxAriaLabel="Maximum estimated retail value"
    />
  );
}
