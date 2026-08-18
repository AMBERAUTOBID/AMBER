"use client";

import { useState } from "react";
import { clsx } from "clsx";
import { FunnelSimple, CaretDown } from "@phosphor-icons/react/dist/ssr";

/**
 * Collapses the filter sidebar on phones and tablets, and gets out of the way
 * from `lg` up.
 *
 * WHY A WRAPPER RATHER THAN STATE INSIDE FilterPanel: that panel is a server
 * component on purpose — every option is a `<Link>`, so the address bar is the
 * only source of truth and the whole thing works with JavaScript off (see its
 * header comment). Making it a client component to hold one boolean would
 * throw that away. Here the panel arrives as `children`, still rendered on the
 * server, and only the disclosure button is client code.
 *
 * WHY THE PANEL STAYS OPEN ACROSS A FILTER CLICK: ticking a filter is a
 * `next/link` navigation, and App Router soft navigation re-renders the server
 * tree while preserving client state for components that keep their place in
 * it. This component does, so `open` survives — which is the difference
 * between picking three filters in a row and reopening the panel three times.
 * If a future change remounts this (a `key` on an ancestor, a Suspense
 * boundary that resets), the symptom is the panel snapping shut after every
 * tick, and the fix is to persist `open` rather than to fight the remount.
 *
 * Below `lg` the sidebar sits above the results rather than beside them, so
 * expanded it pushes the cars off the screen — which is the whole reason this
 * exists. `lg` is therefore the same breakpoint as the grid's, not a taste.
 */
export default function FilterDisclosure({
  label,
  activeCount,
  children,
}: {
  /** Reuses the panel's own heading, so no new message key is needed. */
  label: string;
  activeCount: number;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="filter-panel"
        className="mb-3 flex w-full items-center justify-between gap-3 rounded-2xl border border-char-200 bg-white px-4 py-3.5 text-sm font-bold text-char-900 transition-colors hover:border-amber-300 lg:hidden"
      >
        <span className="flex items-center gap-2">
          <FunnelSimple size={18} weight="bold" className="text-amber-500" />
          {label}
          {/* The count is why this is safe to collapse by default: a closed
              panel would otherwise hide the fact that anything is filtering
              at all, and "why are there only 40 results" becomes unanswerable
              without opening it. */}
          {activeCount > 0 && (
            <span className="rounded-full bg-amber-600 px-2 py-0.5 text-xs font-bold text-white tabular-nums">
              {activeCount}
            </span>
          )}
        </span>
        <CaretDown
          size={16}
          weight="bold"
          aria-hidden
          className={clsx(
            "shrink-0 text-char-500 transition-transform duration-200",
            open && "rotate-180"
          )}
        />
      </button>

      <div id="filter-panel" className={clsx(!open && "hidden", "lg:block")}>
        {children}
      </div>

      {/* Without JavaScript the button above cannot toggle anything, so the
          panel would be permanently unreachable on a phone — worse than the
          scrolling this replaces. This restores it. `style-src` allows
          'unsafe-inline', checked, so the rule is not silently dropped. */}
      <noscript>
        <style>{`#filter-panel{display:block!important}`}</style>
      </noscript>
    </>
  );
}
