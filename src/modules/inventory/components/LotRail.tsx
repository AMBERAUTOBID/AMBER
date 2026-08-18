"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CaretLeft, CaretRight } from "@phosphor-icons/react/dist/ssr";

/**
 * One row of lot cards that scrolls sideways.
 *
 * ⚠️ IT REPLACED A TWO-ROW GRID, on the owner's call. Eight cards stacked two
 * deep pushed the cost calculator and the route map — the two things that
 * actually differentiate this business — most of a screen further down, and a
 * grid can only ever show what fits. A single row shows fourteen and can grow
 * without costing the page any more height.
 *
 * **Arrows, not just swipe.** Scroll-snap alone is fine on a phone and awkward
 * on a desktop, where a mouse has no horizontal wheel; the competitor's rails
 * carry arrows for the same reason. They hide themselves at each end rather
 * than sitting there disabled, so the control never invites a click that does
 * nothing.
 *
 * The row is measured rather than assumed: `scrollLeft` against `scrollWidth`
 * decides which arrows exist, and a ResizeObserver re-checks it, because how
 * many cards fit changes with the window.
 */
export default function LotRail({
  children,
  labels,
}: {
  children: React.ReactNode;
  labels: { previous: string; next: string };
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(true);

  const measure = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    // A pixel of slack: sub-pixel layout means scrollLeft rarely lands on an
    // exact 0 or an exact maximum.
    setAtStart(el.scrollLeft <= 1);
    setAtEnd(el.scrollLeft >= el.scrollWidth - el.clientWidth - 1);
  }, []);

  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [measure]);

  function nudge(direction: 1 | -1) {
    const el = trackRef.current;
    if (!el) return;
    // Roughly one card, taken from the first child rather than hard-coded, so
    // the step stays right if the card width ever changes.
    const card = el.firstElementChild as HTMLElement | null;
    const step = card ? card.getBoundingClientRect().width + 20 : el.clientWidth * 0.8;
    el.scrollBy({ left: step * direction, behavior: "smooth" });
  }

  const arrow =
    "flex h-10 w-10 items-center justify-center rounded-full border border-char-200 bg-white text-char-700 shadow-sm transition-colors hover:border-amber-400 hover:text-amber-700 disabled:opacity-0";

  return (
    <div className="relative">
      <div
        ref={trackRef}
        onScroll={measure}
        // `snap-x` so a swipe lands on a card edge rather than mid-photograph.
        // The scrollbar is hidden because the arrows and the cut-off card at
        // the edge already say the row continues.
        className="flex snap-x snap-mandatory gap-5 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {children}
      </div>

      {/* Placed outside the scroller so they do not travel with it. Hidden
          rather than disabled at the ends — see the note above. */}
      {!atStart && (
        <button
          type="button"
          onClick={() => nudge(-1)}
          aria-label={labels.previous}
          className={`${arrow} absolute -left-3 top-[38%] z-10 hidden -translate-y-1/2 sm:flex`}
        >
          <CaretLeft size={18} weight="bold" />
        </button>
      )}
      {!atEnd && (
        <button
          type="button"
          onClick={() => nudge(1)}
          aria-label={labels.next}
          className={`${arrow} absolute -right-3 top-[38%] z-10 hidden -translate-y-1/2 sm:flex`}
        >
          <CaretRight size={18} weight="bold" />
        </button>
      )}
    </div>
  );
}
