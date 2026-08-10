"use client";

/**
 * A two-ended range control: number boxes above, a dual-thumb track below.
 *
 * EXTRACTED FROM `OdometerRange` RATHER THAN COPIED, when engine size needed
 * the same thing. The two differ only in their bounds, their step and how a
 * number is written out — everything else, including the awkward parts (two
 * overlaid `input[type=range]` with pointer events disabled on the track so
 * both thumbs stay reachable), is identical. A second copy would have drifted:
 * the first fix to land on one of them would have missed the other.
 *
 * Stays a client component because it is genuinely interactive. The filter
 * panel deliberately is not — it is links only, so the back button works and
 * there is no state to desynchronise from the address bar — and this control
 * therefore lives in the search widget, which already submits a query.
 */

const THUMB_CLASS =
  "[&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:bg-amber-500 [&::-webkit-slider-thumb]:shadow [&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:cursor-pointer [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-white [&::-moz-range-thumb]:bg-amber-500 [&::-moz-range-thumb]:shadow [&::-moz-range-track]:bg-transparent [&::-webkit-slider-runnable-track]:bg-transparent";

export default function RangeSlider({
  min,
  max,
  floor,
  ceiling,
  step,
  format,
  onChange,
  title,
  resetLabel,
  minAriaLabel,
  maxAriaLabel,
}: {
  min: number;
  max: number;
  /** The bottom of the track — the value that means "no minimum". */
  floor: number;
  /** The top of the track. Reaching it means "and above", not a hard cap: see
   * `rangeParams`, which drops the upper bound there. */
  ceiling: number;
  step: number;
  /** Writes a value out for the reader. `atCeiling` is where the "+" goes. */
  format: (value: number, atCeiling: boolean) => string;
  onChange: (min: number, max: number) => void;
  title: string;
  resetLabel: string;
  minAriaLabel: string;
  maxAriaLabel: string;
}) {
  return (
    <div className="rounded-xl border border-char-200 bg-white p-3.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-char-500">
          {title}
        </span>
        <button
          type="button"
          onClick={() => onChange(floor, ceiling)}
          className="text-xs font-semibold text-amber-600 transition-colors hover:text-amber-700"
        >
          {resetLabel}
        </button>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <input
          type="number"
          inputMode="numeric"
          value={min}
          min={floor}
          max={max}
          step={step}
          onChange={(e) => onChange(Math.min(Number(e.target.value) || 0, max), max)}
          className="w-full min-w-0 rounded-lg border border-char-200 bg-char-50 px-2.5 py-1.5 text-sm outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100"
        />
        <span className="shrink-0 text-char-300">–</span>
        <input
          type="number"
          inputMode="numeric"
          value={max}
          min={min}
          max={ceiling}
          step={step}
          onChange={(e) => onChange(min, Math.max(Number(e.target.value) || 0, min))}
          className="w-full min-w-0 rounded-lg border border-char-200 bg-char-50 px-2.5 py-1.5 text-sm outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100"
        />
      </div>

      <div className="mt-3 flex justify-between text-xs font-medium text-char-500">
        <span>{format(min, false)}</span>
        <span>{format(max, max >= ceiling)}</span>
      </div>

      <div className="relative mt-1.5 h-5">
        <div className="absolute top-1/2 h-1 w-full -translate-y-1/2 rounded-full bg-char-200" />
        <div
          className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-amber-500"
          style={{
            left: `${(min / ceiling) * 100}%`,
            // A number typed straight into the box can exceed the track; clamp
            // so the fill cannot run off the right-hand end.
            right: `${Math.max(0, 100 - (max / ceiling) * 100)}%`,
          }}
        />
        <input
          type="range"
          aria-label={minAriaLabel}
          min={floor}
          max={ceiling}
          step={step}
          value={min}
          onChange={(e) => onChange(Math.min(Number(e.target.value), max - step), max)}
          className={`pointer-events-none absolute inset-0 h-5 w-full appearance-none bg-transparent ${THUMB_CLASS}`}
        />
        <input
          type="range"
          aria-label={maxAriaLabel}
          min={floor}
          max={ceiling}
          step={step}
          value={max}
          onChange={(e) => onChange(min, Math.max(Number(e.target.value), min + step))}
          className={`pointer-events-none absolute inset-0 h-5 w-full appearance-none bg-transparent ${THUMB_CLASS}`}
        />
      </div>
    </div>
  );
}
