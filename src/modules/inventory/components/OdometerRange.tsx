"use client";

import RangeSlider from "./RangeSlider";

export const ODO_MIN = 0;
/**
 * Raised from 250,000 to match bidauto.online, which paces the same catalogue at
 * 0–500,000.
 *
 * It was not a cosmetic mismatch: **5,825 searchable lots read above 250,000 mi
 * and were unreachable through this control at any setting** — the top of the
 * slider was a wall, not a range. 5,358 of them fall inside the new range; the
 * remaining 467 are covered by the `+` on the top stop, which is why
 * `formatMiles` renders the maximum as "500,000+ mi" rather than a hard figure.
 *
 * The true maximum in the data is 2,437,131 — a Toyota Sienna, which is not a
 * real reading. Sizing the slider to the data's maximum would make the whole
 * useful range occupy the first tenth of the track.
 */
export const ODO_MAX = 500000;
const ODO_STEP = 5000;

function formatMiles(value: number, atCeiling: boolean) {
  return `${value.toLocaleString()}${atCeiling ? "+" : ""} mi`;
}

export default function OdometerRange({
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
      floor={ODO_MIN}
      ceiling={ODO_MAX}
      step={ODO_STEP}
      format={formatMiles}
      onChange={onChange}
      title={title}
      resetLabel={resetLabel}
      minAriaLabel="Minimum odometer"
      maxAriaLabel="Maximum odometer"
    />
  );
}
