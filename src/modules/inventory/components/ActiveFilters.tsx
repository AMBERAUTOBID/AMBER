import { Link } from "@/i18n/navigation";
import { X, ArrowCounterClockwise } from "@phosphor-icons/react/dist/ssr";
import { parseSelected, toggleHref } from "@/modules/inventory/model/filterQuery";
import { DIMENSIONS, optionLabel, type FilterPanelLabels } from "./FilterPanel";

/**
 * Everything currently narrowing the results, each removable on its own.
 *
 * WHY IT EXISTS. The panel shows what you *can* pick; nothing showed what you
 * *had* picked. On a phone the panel is collapsed, so the only evidence of an
 * active filter was a count on a button — and undoing one meant opening the
 * panel, finding the dimension, and remembering which value was ticked. Three
 * filters deep, "why am I seeing 40 cars" had no answer on screen.
 *
 * A SERVER COMPONENT, like the panel and for the same reasons: every chip is a
 * `<Link>` to the current URL minus that one value, so there is no client state
 * to fall out of step with the address bar, back does what it looks like it
 * does, and it works with JavaScript off.
 *
 * IT COVERS RANGES AND THE BROWSE CONTEXT TOO, not only facets. A visitor who
 * set an engine size and a retail floor has narrowed the result set just as
 * surely as one who ticked a checkbox, and showing only the checkboxes would
 * make "clear everything" leave results still filtered — which is the exact
 * confusion this is meant to remove.
 */

/** A range shown as one chip, since "min" and "max" are one thought. */
const RANGES = [
  // `plain` because a year is a NAME, not a quantity. Grouped as a number it
  // rendered "≥ 2,015", which is not a year anybody has heard of — and the more
  // separators a locale uses, the worse it reads. Caught on the page, not by a
  // test: every assertion about this chip was about which params it covers.
  { from: "yearFrom", to: "yearTo", label: "year", plain: true },
  { from: "odoMin", to: "odoMax", label: "odometer", unit: "mi" },
  { from: "engineFrom", to: "engineTo", label: "engine", unit: "L", divisor: 1000, decimals: 1 },
  { from: "retailMin", to: "retailMax", label: "retail", currency: true },
  // No priceMin/priceMax chip: the page reads those params but no control sets
  // them, so a chip would need a translated label for something only a
  // hand-edited URL can produce. "Clear all" still drops them, since it goes to
  // a bare /search.
] as const;

export interface ActiveFilterLabels extends FilterPanelLabels {
  /** Range names, reused from the search widget above rather than duplicated. */
  ranges: Record<string, string>;
  /** Category tabs, keyed as in the widget: automobile / motorcycle / truck. */
  vehicleTypes: Record<string, string>;
  buyNow: string;
  /** The free-text query, shown so it can be dropped like anything else. */
  searchTerm: string;
  clearAll: string;
  /** Names the browse tab so it cannot be mistaken for the vehicle_class facet. */
  browseType: string;
}

/** The number alone. The unit is added once, by formatRange. */
function formatBound(value: string, r: (typeof RANGES)[number]): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return value;
  if ("plain" in r && r.plain) return String(n);
  if ("currency" in r && r.currency) return `$${n.toLocaleString("en-US")}`;
  if ("divisor" in r && r.divisor) return (n / r.divisor).toFixed(r.decimals ?? 0);
  return n.toLocaleString("en-US");
}

/**
 * "2015 – 2020", "≤ 150,000 mi", "≥ $5,000".
 *
 * The unit lands once at the end rather than on each bound: "2.0 L – 3.0 L"
 * reads as two measurements where "2.0 – 3.0 L" reads as one range.
 *
 * ≤ and ≥ rather than a dangling dash for one-sided ranges. "– 150,000 mi"
 * looked like a negative number, and they need no translation, which matters
 * for a chip that has to stay short in three languages.
 */
function formatRange(
  from: string | undefined,
  to: string | undefined,
  r: (typeof RANGES)[number]
): string {
  const unit = "unit" in r && r.unit ? ` ${r.unit}` : "";
  if (from && to) return `${formatBound(from, r)} – ${formatBound(to, r)}${unit}`;
  if (from) return `≥ ${formatBound(from, r)}${unit}`;
  return `≤ ${formatBound(to!, r)}${unit}`;
}

/**
 * The query minus some keys, and always minus `cursor`.
 *
 * Dropping the cursor matters on every chip: page 4 of a filtered search does
 * not exist once the filter is gone, and carrying it through lands the visitor
 * on an empty page after removing something.
 */
function without(query: Record<string, string>, ...keys: string[]): Record<string, string> {
  const rest = { ...query };
  for (const k of [...keys, "cursor"]) delete rest[k];
  return rest;
}

function Chip({
  group,
  value,
  href,
}: {
  /** The dimension name. Without it "Front" is ambiguous — it is a damage
   *  location, a drive type and a body position, and the chip is the only
   *  place the visitor sees the value out of its group's context. */
  group?: string;
  value: string;
  href: { pathname: string; query: Record<string, string> };
}) {
  return (
    <Link
      href={href}
      // Same rule as the panel: removing a chip refines the page in place.
      scroll={false}
      className="group inline-flex max-w-full items-center gap-1.5 rounded-full border border-char-200 bg-white py-1.5 pl-3 pr-2 text-sm text-char-700 shadow-sm transition-colors hover:border-amber-300 hover:bg-amber-50/60"
    >
      {group && <span className="shrink-0 text-xs text-char-500">{group}</span>}
      <span className="truncate font-medium">{value}</span>
      <X
        size={14}
        weight="bold"
        aria-hidden
        className="shrink-0 text-char-300 transition-colors group-hover:text-amber-600"
      />
    </Link>
  );
}

export default function ActiveFilters({
  query,
  labels,
}: {
  query: Record<string, string>;
  labels: ActiveFilterLabels;
}) {
  const chips: React.ReactNode[] = [];

  // Order matches how a visitor built the search, top of the page downwards:
  // what they typed, what they browsed to, then what they narrowed by.
  if (query.q) {
    chips.push(
      <Chip
        key="q"
        group={labels.searchTerm}
        value={query.q}
        href={{ pathname: "/search", query: without(query, "q") }}
      />
    );
  }

  if (query.category) {
    chips.push(
      <Chip
        key="category"
        // Labelled, because the browse tab and the vehicle_class facet can both
        // be set to the same thing: unlabelled they render as "Automobile" next
        // to "Category Automobiles" and read as one chip duplicated. They are
        // genuinely different — the tab is where you browsed, the facet is what
        // you ticked — and only the group name says so.
        group={labels.browseType}
        value={labels.vehicleTypes[query.category] ?? query.category}
        href={{ pathname: "/search", query: without(query, "category") }}
      />
    );
  }

  /**
   * Make and model are two chips, not one.
   *
   * They shared the search-term chip — `query.q ?? query.make ?? query.model` —
   * which was defensible while nothing on this page could set them
   * independently: they arrived together from the widget above and were dropped
   * together. The filter panel changed that. A visitor who picks BMW and then
   * 3 Series has made two choices and has to be able to undo the second without
   * losing the first; one chip reading "3 Series" that silently cleared BMW as
   * well is the sort of control that teaches people not to trust the chips.
   *
   * ⚠️ REMOVING THE MAKE REMOVES THE MODEL WITH IT. A model without its make is
   * not a wider search but a broken one: `resolveModels` needs the make to know
   * which tree the label came from, and without it the server falls back to
   * `model ILIKE %3 Series%` across all 1,316 marques.
   */
  if (query.make) {
    chips.push(
      <Chip
        key="make"
        group={labels.groups.make}
        value={query.make}
        href={{ pathname: "/search", query: without(query, "make", "model") }}
      />
    );
  }
  if (query.model) {
    chips.push(
      <Chip
        key="model"
        group={labels.groups.model}
        value={query.model}
        href={{ pathname: "/search", query: without(query, "model") }}
      />
    );
  }

  for (const d of DIMENSIONS) {
    for (const value of parseSelected(query[d.param])) {
      chips.push(
        <Chip
          key={`${d.param}-${value}`}
          group={labels.groups[d.key]}
          value={optionLabel(labels, d.vocab, value)}
          href={toggleHref(query, d.param, value)}
        />
      );
    }
  }

  for (const r of RANGES) {
    const from = query[r.from];
    const to = query[r.to];
    if (!from && !to) continue;
    chips.push(
      <Chip
        key={r.label}
        group={labels.ranges[r.label]}
        value={formatRange(from, to, r)}
        href={{ pathname: "/search", query: without(query, r.from, r.to) }}
      />
    );
  }

  if (query.buyNow === "1") {
    chips.push(<Chip key="buyNow" value={labels.buyNow} href={{ pathname: "/search", query: without(query, "buyNow") }} />);
  }

  // One chip is not a set worth summarising, and the row would cost more
  // vertical space than it explains. Two is where "which ones are on" starts
  // being a real question.
  if (chips.length === 0) return null;

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      {chips}
      {chips.length > 1 && (
        // Straight to /search: everything above is gone, which is the whole
        // promise of the word. Deliberately not the panel's "reset", which
        // keeps the browse context — here the context is a chip of its own,
        // so leaving it behind would contradict the chips beside it.
        <Link
          href="/search"
          scroll={false}
          className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold text-amber-600 transition-colors hover:bg-amber-50 hover:text-amber-700"
        >
          <ArrowCounterClockwise size={14} weight="bold" aria-hidden />
          {labels.clearAll}
        </Link>
      )}
    </div>
  );
}
