"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CaretDown, CaretRight, MagnifyingGlass } from "@phosphor-icons/react/dist/ssr";
import { clsx } from "clsx";
import type { ModelGroup } from "@/modules/inventory/model/modelTree";

/**
 * The model picker: families you can open, and the exact cars inside them.
 *
 * The list it replaces was flat and hand-typed — 14 BMW models against the 171
 * our rows hold. Flat is not an option at 171: it is a scrolling wall in which
 * `328I`, `330I` and `320I` are three separate strangers rather than three
 * ways of buying a 3 Series. So a family is one row that opens, exactly the
 * shape Autotrader uses, and the count beside each row is real inventory.
 *
 * WHAT MAKES IT USABLE AT THIS SIZE, in the order it matters:
 *  - **Type to filter.** With 171 models, scrolling is the fallback, not the
 *    plan. A search hit inside a closed family opens it, so a visitor typing
 *    "328" is never told "nothing found" by a row that is merely folded up.
 *  - **The family is clickable itself.** Picking "3 Series" searches the whole
 *    family; opening it is a separate target on the left. Making the whole row
 *    a toggle would mean a family could never be selected in one click.
 *  - **Counts everywhere**, so nobody clicks toward an empty page.
 */
export default function ModelSelect({
  value,
  onChange,
  tree,
  placeholder,
  searchPlaceholder,
  loading = false,
  disabled = false,
}: {
  value: string;
  onChange: (v: string) => void;
  tree: ModelGroup[];
  placeholder: string;
  searchPlaceholder: string;
  loading?: boolean;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
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

  // The tree changes when the make does, and yesterday's pick is not in the new
  // one. Clearing it here rather than in the parent keeps the two selects from
  // disagreeing about what is currently chosen.
  useEffect(() => {
    if (!value) return;
    const present = tree.some(
      (g) => g.label === value || g.children.some((c) => c.label === value)
    );
    if (!present) onChange("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tree]);

  /**
   * Filtering keeps a family whose own name matches, and otherwise keeps only
   * the children that match — so typing "328" shows the 3 Series with one car
   * under it, not the whole family.
   */
  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return tree;
    const out: ModelGroup[] = [];
    for (const group of tree) {
      if (group.label.toLowerCase().includes(q)) {
        out.push(group);
        continue;
      }
      const children = group.children.filter((c) => c.label.toLowerCase().includes(q));
      if (children.length > 0) out.push({ ...group, children });
    }
    return out;
  }, [tree, filter]);

  const isOpen = (label: string) => expanded.has(label) || filter.trim().length > 0;

  function toggle(label: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  }

  function pick(label: string) {
    onChange(label === value ? "" : label);
    setOpen(false);
    setFilter("");
  }

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
        <span className="truncate">{value || placeholder}</span>
        <CaretDown size={14} weight="bold" className="shrink-0" />
      </button>

      {open && !disabled && (
        <div className="absolute left-0 top-full z-30 mt-1.5 w-72 max-w-[85vw] overflow-hidden rounded-xl border border-char-200 bg-white shadow-xl shadow-char-900/10">
          <div className="relative border-b border-char-100 p-2">
            <MagnifyingGlass
              size={14}
              className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-char-500"
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

          <ul role="listbox" className="max-h-72 overflow-y-auto py-1">
            {loading && <li className="px-3 py-2 text-sm text-char-500">…</li>}
            {!loading && visible.length === 0 && (
              <li className="px-3 py-2 text-sm text-char-500">—</li>
            )}

            {visible.map((group) => {
              const hasChildren = group.children.length > 0;
              const openHere = hasChildren && isOpen(group.label);
              return (
                <li key={group.label} role="option" aria-selected={group.label === value}>
                  <div className="flex items-stretch">
                    {/* The disclosure is its own target so that clicking the
                        name still selects the family — see the note above. */}
                    {hasChildren ? (
                      <button
                        type="button"
                        onClick={() => toggle(group.label)}
                        aria-label={group.label}
                        aria-expanded={openHere}
                        className="flex w-7 shrink-0 items-center justify-center text-char-500 hover:text-amber-600"
                      >
                        <CaretRight
                          size={12}
                          weight="bold"
                          className={clsx("transition-transform", openHere && "rotate-90")}
                        />
                      </button>
                    ) : (
                      <span className="w-7 shrink-0" />
                    )}
                    <button
                      type="button"
                      onClick={() => pick(group.label)}
                      className={clsx(
                        "flex flex-1 items-baseline justify-between gap-2 py-2 pr-3 text-left text-sm transition-colors hover:text-amber-700",
                        group.label === value ? "font-semibold text-amber-600" : "text-char-700"
                      )}
                    >
                      <span className="truncate">{group.label}</span>
                      <span className="shrink-0 text-xs tabular-nums text-char-500">
                        ({group.count.toLocaleString()})
                      </span>
                    </button>
                  </div>

                  {openHere && (
                    <ul className="border-l border-char-100 pl-7">
                      {group.children.map((child) => (
                        <li key={child.label}>
                          <button
                            type="button"
                            onClick={() => pick(child.label)}
                            className={clsx(
                              "flex w-full items-baseline justify-between gap-2 py-1.5 pr-3 text-left text-sm transition-colors hover:text-amber-700",
                              child.label === value
                                ? "font-semibold text-amber-600"
                                : "text-char-500"
                            )}
                          >
                            <span className="truncate">{child.label}</span>
                            <span className="shrink-0 text-xs tabular-nums text-char-300">
                              ({child.count.toLocaleString()})
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
