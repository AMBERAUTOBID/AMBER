"use client";

import RangeSlider from "./RangeSlider";
import { ODO_MIN, ODO_MAX, ODO_STEP, formatMiles } from "../model/odometerRange";

/**
 * The mileage slider as the search widget uses it — bounded, stepped and
 * captioned, with nothing to decide at the call site.
 *
 * The numbers moved to `model/odometerRange.ts` when the filter panel needed
 * the same range: a server-rendered panel cannot import a `"use client"` module
 * for three constants, and two copies of a ceiling that the URL depends on is
 * exactly the kind of pair that drifts. Re-exported here so the widget's
 * existing imports keep resolving.
 */
export { ODO_MIN, ODO_MAX };

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
