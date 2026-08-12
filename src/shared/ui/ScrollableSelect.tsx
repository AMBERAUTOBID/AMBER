"use client";

import { useEffect, useRef, useState } from "react";
import { CaretDown, MagnifyingGlass } from "@phosphor-icons/react/dist/ssr";
import { clsx } from "clsx";

export default function ScrollableSelect({
  value,
  onChange,
  options,
  placeholder,
  searchPlaceholder,
  disabled = false,
  getLabel,
  footer,
}: {
  value: string;
  onChange: (v: string) => void;
  options: readonly string[];
  placeholder: string;
  searchPlaceholder: string;
  disabled?: boolean;
  getLabel?: (opt: string) => string;
  /** Pinned under the list — used by the make picker for "show all makes",
   *  which has to sit where the list runs out rather than above it. */
  footer?: React.ReactNode;
}) {
  const label = (opt: string) => (getLabel ? getLabel(opt) : opt);
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setFilter("");
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  // Options can legitimately shrink (e.g. switching category) out from under
  // an already-picked value — clear a selection that's no longer valid.
  useEffect(() => {
    if (value && !options.includes(value)) onChange("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options]);

  const filtered = filter
    ? options.filter((o) => o.toLowerCase().includes(filter.toLowerCase()))
    : options;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={clsx(
          "flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2.5 text-left text-sm font-medium transition-colors",
          disabled
            ? "cursor-not-allowed border-char-100 bg-char-50 text-char-300"
            : value
              ? "border-amber-400 bg-amber-50 text-amber-800"
              : "border-char-200 bg-white text-char-500 hover:border-char-300"
        )}
      >
        <span className="truncate">{value ? label(value) : placeholder}</span>
        <CaretDown size={14} weight="bold" className="shrink-0" />
      </button>

      {open && !disabled && (
        <div className="absolute left-0 top-full z-30 mt-1.5 w-64 max-w-[80vw] overflow-hidden rounded-xl border border-char-200 bg-white shadow-xl shadow-char-900/10">
          {options.length > 8 && (
            <div className="relative border-b border-char-100 p-2">
              <MagnifyingGlass
                size={14}
                className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-char-400"
              />
              <input
                autoFocus
                type="text"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder={searchPlaceholder}
                className="w-full rounded-lg bg-char-50 py-1.5 pl-8 pr-2 text-sm outline-none"
              />
            </div>
          )}
          <ul role="listbox" className="max-h-56 overflow-y-auto py-1">
            {filtered.length === 0 && (
              <li className="px-3 py-2 text-sm text-char-400">—</li>
            )}
            {filtered.map((opt) => (
              <li key={opt} role="option" aria-selected={opt === value}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(opt === value ? "" : opt);
                    setOpen(false);
                    setFilter("");
                  }}
                  className={clsx(
                    "block w-full px-3 py-2 text-left text-sm transition-colors hover:bg-amber-50 hover:text-amber-700",
                    opt === value ? "font-semibold text-amber-600" : "text-char-700"
                  )}
                >
                  {label(opt)}
                </button>
              </li>
            ))}
          </ul>
          {footer && <div className="border-t border-char-100">{footer}</div>}
        </div>
      )}
    </div>
  );
}
