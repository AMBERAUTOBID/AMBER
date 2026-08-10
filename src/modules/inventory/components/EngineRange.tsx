"use client";

import RangeSlider from "./RangeSlider";

export const ENGINE_MIN = 0;
/**
 * The top stop, in cubic centimetres.
 *
 * MEASURED over the 146,898 COPART/IAAI lots that carry an engine size (92.5%
 * of the catalogue): the median is 2,500 cc, the 95th percentile 5,700 and the
 * 99th 6,700. Only **783 lots sit above 8,000** — they are the 14–16 litre
 * six-cylinder units in commercial trucks, and the largest in the data is
 * 16,100.
 *
 * Sizing the track to that 16,100 would push every ordinary car into the first
 * third of it and make a 1.6 from a 2.0 almost impossible to pick apart. 8,000
 * keeps the range people actually shop in spread across the whole track, and
 * the `+` on the top stop keeps those 783 reachable — `rangeParams` drops the
 * upper bound there, so "8.0+ L" really does mean "and above". That is the
 * lesson the odometer control had to learn the hard way, applied up front.
 */
export const ENGINE_MAX = 8000;
/** 100 cc — one decimal place in litres, which is how an engine is spoken about. */
const ENGINE_STEP = 100;

/**
 * Litres, not cubic centimetres.
 *
 * The column is stored in cc because that is what parses cleanly out of 694
 * distinct vendor strings ("2.0L 4" from Copart, "2.0L I-4 DOHC, VVT, 147HP"
 * from IAAI), but nobody asks for a 2,000 cc car. The URL keeps cc; only the
 * reader sees litres.
 */
function formatLitres(value: number, atCeiling: boolean) {
  return `${(value / 1000).toFixed(1)}${atCeiling ? "+" : ""} L`;
}

export default function EngineRange({
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
      floor={ENGINE_MIN}
      ceiling={ENGINE_MAX}
      step={ENGINE_STEP}
      format={formatLitres}
      onChange={onChange}
      title={title}
      resetLabel={resetLabel}
      minAriaLabel="Minimum engine size"
      maxAriaLabel="Maximum engine size"
    />
  );
}
