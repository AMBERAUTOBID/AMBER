"use client";

import { useState } from "react";

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
 * panel around it deliberately is not — it is links only, so the back button
 * works and there is no state to desynchronise from the address bar — which is
 * why this is dropped into that panel as an island rather than the panel being
 * turned into a client component to hold it.
 *
 * TWO THINGS IT LEARNED WHEN THE FILTER PANEL ADOPTED IT:
 *
 *  - **`onCommit`, because in the panel every change is a page load.** Dragging
 *    a thumb fires `onChange` on every step, and navigating on each of those
 *    would queue dozens of searches to render one. So movement stays local and
 *    cheap, and `onCommit` fires once the visitor has finished — mouse up, key
 *    up, or a number box losing focus. A caller with nothing expensive to do
 *    (the search widget, which only submits when Search is pressed) omits it.
 *  - **The number boxes hold TEXT while they are being typed in.** They were
 *    bound straight to the number and clamped on every keystroke, which made
 *    them almost unusable for the thing they exist for: clearing the box wrote
 *    `0` into it, and typing `150000` over a `50000` clamped at every
 *    intermediate digit. Now the draft is a string, parsed and clamped once on
 *    blur or Enter, and a draft that is not a number is discarded rather than
 *    silently becoming zero — which is a real and very different filter.
 */

const THUMB_CLASS =
  "[&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:bg-amber-500 [&::-webkit-slider-thumb]:shadow [&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:cursor-pointer [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-white [&::-moz-range-thumb]:bg-amber-500 [&::-moz-range-thumb]:shadow [&::-moz-range-track]:bg-transparent [&::-webkit-slider-runnable-track]:bg-transparent";

const BOX_CLASS =
  "w-full min-w-0 rounded-lg border border-char-200 bg-char-50 px-2.5 py-1.5 text-sm tabular-nums outline-none focus:border-amber-400 focus:bg-white focus:ring-2 focus:ring-amber-100";

/**
 * One typed bound.
 *
 * Its own component so that each box owns its draft. Sharing one piece of state
 * between the two meant typing in the upper box wiped the lower one's text the
 * moment the parent re-rendered.
 */
function BoundBox({
  value,
  onCommit,
  ariaLabel,
  placeholder,
}: {
  value: number;
  /** The parsed number, or null when the box was left empty or unreadable. */
  onCommit: (next: number | null) => void;
  ariaLabel: string;
  placeholder: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);

  // A drag on the track has to show up in the box, but only while the box is
  // not being typed in — `draft === null` is exactly "not being typed in".
  const shown = draft ?? String(value);

  function commit() {
    if (draft === null) return;
    const trimmed = draft.replace(/[\s,]/g, "");
    setDraft(null);
    if (trimmed === "") return onCommit(null);
    const n = Number(trimmed);
    if (!Number.isFinite(n)) return;
    onCommit(n);
  }

  return (
    <input
      type="text"
      inputMode="numeric"
      aria-label={ariaLabel}
      placeholder={placeholder}
      value={shown}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          commit();
        }
        // Abandon the edit and show the live value again.
        if (e.key === "Escape") setDraft(null);
      }}
      className={BOX_CLASS}
    />
  );
}

export default function RangeSlider({
  min,
  max,
  floor,
  ceiling,
  step,
  format,
  onChange,
  onCommit,
  title,
  resetLabel,
  minAriaLabel,
  maxAriaLabel,
  compact = false,
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
  /**
   * The visitor has finished moving it — mouse up, key up, or a number box
   * losing focus. Omit when acting on every change is cheap.
   */
  onCommit?: (min: number, max: number) => void;
  title: string;
  resetLabel: string;
  minAriaLabel: string;
  maxAriaLabel: string;
  /** Inside the filter panel, where the card and its border are the panel's
   *  own and the heading has to match the group headings beside it. */
  compact?: boolean;
}) {
  /**
   * A cleared box means "no bound", which is the track's own end.
   *
   * ⚠️ `min` and `max` ARE the live pair — there is no mirrored copy, and the
   * release handlers below read the props directly. A copy lived here for a
   * while on the theory that `keyup` fires before React has re-rendered with the
   * moved thumb, so a committed range would lag a step behind the screen. It
   * does not: `input` and `keyup` are two separate browser events and React
   * flushes between them. The copy also needed an effect that re-synchronised
   * itself on every render, which is a cascading render the lint rule is right
   * to refuse.
   */
  function commitBound(which: "min" | "max", value: number | null) {
    const raw = value ?? (which === "min" ? floor : ceiling);
    const clamped = Math.min(Math.max(raw, floor), ceiling);
    // The bounds cannot cross. The OTHER one gets pushed out of the way rather
    // than the typed number being refused: someone who types 200,000 into the
    // lower box means it, and clamping it back to the current upper bound reads
    // as the box ignoring them.
    const nextMin = which === "min" ? clamped : Math.min(min, clamped);
    const nextMax = which === "max" ? clamped : Math.max(max, clamped);
    onChange(nextMin, nextMax);
    onCommit?.(nextMin, nextMax);
  }

  return (
    <div className={compact ? "" : "rounded-xl border border-char-200 bg-white p-3.5"}>
      <div className="flex items-center justify-between">
        <span
          className={
            compact
              ? "text-[11px] font-bold uppercase tracking-wider text-char-500"
              : "text-xs font-semibold uppercase tracking-wider text-char-500"
          }
        >
          {title}
        </span>
        <button
          type="button"
          onClick={() => {
            onChange(floor, ceiling);
            onCommit?.(floor, ceiling);
          }}
          className="text-xs font-semibold text-amber-600 transition-colors hover:text-amber-700"
        >
          {resetLabel}
        </button>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <BoundBox
          value={min}
          onCommit={(v) => commitBound("min", v)}
          ariaLabel={minAriaLabel}
          placeholder={String(floor)}
        />
        <span className="shrink-0 text-char-300">–</span>
        <BoundBox
          value={max}
          onCommit={(v) => commitBound("max", v)}
          ariaLabel={maxAriaLabel}
          placeholder={String(ceiling)}
        />
      </div>

      <div className="mt-3 flex justify-between text-xs font-medium text-char-500">
        <span>{format(min, false)}</span>
        <span>{format(max, max >= ceiling)}</span>
      </div>

      {/* The release handlers sit on the wrapper rather than on each input:
          letting go of the mouse a little outside a 16px thumb still ends the
          drag, and the wrapper still sees it. */}
      <div
        className="relative mt-1.5 h-5"
        onPointerUp={() => onCommit?.(min, max)}
        onKeyUp={() => onCommit?.(min, max)}
      >
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
