"use client";

export const ODO_MIN = 0;
export const ODO_MAX = 250000;
const ODO_STEP = 5000;

const THUMB_CLASS =
  "[&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:bg-amber-500 [&::-webkit-slider-thumb]:shadow [&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:cursor-pointer [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-white [&::-moz-range-thumb]:bg-amber-500 [&::-moz-range-thumb]:shadow [&::-moz-range-track]:bg-transparent [&::-webkit-slider-runnable-track]:bg-transparent";

function formatMiles(v: number) {
  const n = v.toLocaleString();
  return v >= ODO_MAX ? `${n}+ mi` : `${n} mi`;
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
    <div className="rounded-xl border border-char-200 bg-white p-3.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-char-500">
          {title}
        </span>
        <button
          type="button"
          onClick={() => onChange(ODO_MIN, ODO_MAX)}
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
          min={ODO_MIN}
          max={max}
          step={ODO_STEP}
          onChange={(e) =>
            onChange(Math.min(Number(e.target.value) || 0, max), max)
          }
          className="w-full min-w-0 rounded-lg border border-char-200 bg-char-50 px-2.5 py-1.5 text-sm outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100"
        />
        <span className="shrink-0 text-char-300">–</span>
        <input
          type="number"
          inputMode="numeric"
          value={max}
          min={min}
          max={ODO_MAX}
          step={ODO_STEP}
          onChange={(e) =>
            onChange(min, Math.max(Number(e.target.value) || 0, min))
          }
          className="w-full min-w-0 rounded-lg border border-char-200 bg-char-50 px-2.5 py-1.5 text-sm outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100"
        />
      </div>

      <div className="mt-3 flex justify-between text-xs font-medium text-char-500">
        <span>{formatMiles(min)}</span>
        <span>{formatMiles(max)}</span>
      </div>

      <div className="relative mt-1.5 h-5">
        <div className="absolute top-1/2 h-1 w-full -translate-y-1/2 rounded-full bg-char-200" />
        <div
          className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-amber-500"
          style={{
            left: `${(min / ODO_MAX) * 100}%`,
            right: `${100 - (max / ODO_MAX) * 100}%`,
          }}
        />
        <input
          type="range"
          aria-label="Minimum odometer"
          min={ODO_MIN}
          max={ODO_MAX}
          step={ODO_STEP}
          value={min}
          onChange={(e) =>
            onChange(Math.min(Number(e.target.value), max - ODO_STEP), max)
          }
          className={`pointer-events-none absolute inset-0 h-5 w-full appearance-none bg-transparent ${THUMB_CLASS}`}
        />
        <input
          type="range"
          aria-label="Maximum odometer"
          min={ODO_MIN}
          max={ODO_MAX}
          step={ODO_STEP}
          value={max}
          onChange={(e) =>
            onChange(min, Math.max(Number(e.target.value), min + ODO_STEP))
          }
          className={`pointer-events-none absolute inset-0 h-5 w-full appearance-none bg-transparent ${THUMB_CLASS}`}
        />
      </div>
    </div>
  );
}
