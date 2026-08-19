/**
 * The bounds of the mileage control, and how a reading is written out.
 *
 * IN `model/` RATHER THAN BESIDE THE SLIDER because two components now need
 * them — the search widget's `OdometerRange` and the filter panel's
 * `FilterControls` — and the second one would otherwise have to import a
 * `"use client"` module to read three constants. It is also what makes the
 * numbers testable without a React renderer, which is the same reason
 * `filterQuery.ts` lives here.
 *
 * ⚠️ `ODO_MAX` IS A DISPLAY CEILING, NOT A CAP ON THE DATA. A search left at the
 * top of the track drops `odoMax` from the URL entirely, so the lots above it
 * are returned — which is why `formatMiles` renders the maximum as "500,000+"
 * rather than a hard figure. Both callers depend on that; a caller that wrote
 * `odoMax=500000` instead would silently lose the 467 lots reading above it.
 */

export const ODO_MIN = 0;

/**
 * Raised from 250,000 to match bidauto.online, which paces the same catalogue at
 * 0–500,000.
 *
 * It was not a cosmetic mismatch: **5,825 searchable lots read above 250,000 mi
 * and were unreachable through this control at any setting** — the top of the
 * slider was a wall, not a range. 5,358 of them fall inside the current range;
 * the remaining 467 are covered by the `+` on the top stop.
 *
 * The true maximum in the data is 2,437,131 — a Toyota Sienna, which is not a
 * real reading. Sizing the slider to the data's maximum would make the whole
 * useful range occupy the first tenth of the track.
 */
export const ODO_MAX = 500000;

/**
 * 5,000 miles a step.
 *
 * The step is what a dragged thumb can land on, not what a typed box accepts —
 * `RangeSlider`'s number boxes clamp to the floor and ceiling and nothing else,
 * so a visitor who wants 137,500 can type it and the URL will carry it.
 */
export const ODO_STEP = 5000;

export function formatMiles(value: number, atCeiling: boolean): string {
  return `${value.toLocaleString()}${atCeiling ? "+" : ""} mi`;
}
