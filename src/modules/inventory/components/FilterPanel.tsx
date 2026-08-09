import { Link } from "@/i18n/navigation";
import type { SearchFacets } from "@/modules/inventory/api";
import { parseSelected, toggleHref } from "@/modules/inventory/model/filterQuery";

/**
 * The filter sidebar, with a live count beside every option.
 *
 * A SERVER COMPONENT DRIVEN BY LINKS, deliberately. Every option is an `<a>`
 * whose href is the current URL with that value toggled, computed here. There is
 * no client state to desynchronise from the address bar, the back button does
 * what it looks like it does, a filtered search is a shareable URL, and the
 * whole panel works with JavaScript off.
 *
 * THE COUNTS ARE THE POINT. bidauto.online shows none, and because its panel is
 * static rather than built from the result set it offers options that cannot
 * match: browsing motorcycles there still offers Body Type "Sedan / SUV /
 * Pickup" and a cylinder list of 3,4,5,6,8,10,12 while listing 2-cylinder bikes.
 * Here the options ARE the result set, so an option that would return nothing
 * cannot appear, and each one states what it would return.
 *
 * Rendered only when the source can produce facets — `getFacets` is optional on
 * `AuctionSource` and Apibara cannot implement it, so on Apibara the page simply
 * has no sidebar and behaves exactly as it did before the mirror existed.
 */

/** Dimensions in display order: the facet key, and the URL/search param it
 * drives. Order is by how often a buyer narrows on it, not alphabetically. */
const DIMENSIONS = [
  { key: "vehicle_class", param: "vehicle_class", vocab: "vehicle_class" },
  { key: "platform", param: "platform", vocab: "platform" },
  { key: "title", param: "title", vocab: "title" },
  { key: "damage", param: "damage", vocab: "damage" },
  { key: "run_cond", param: "run_cond", vocab: "run_cond" },
  { key: "body_type", param: "body_type", vocab: "body_type" },
  { key: "fuel", param: "fuel", vocab: "fuel" },
  { key: "drive", param: "drive", vocab: "drive" },
  { key: "transmission", param: "transmission", vocab: "transmission" },
  // No vocab: cylinder counts are numerals and read the same in every locale.
  // The label falls back to the raw value, which is exactly "4".
  { key: "cylinders", param: "cylinders", vocab: null },
  { key: "color", param: "color", vocab: "color" },
  // Shares the damage vocabulary with the primary field rather than repeating
  // 27 identical labels in three languages — both columns carry the same values,
  // which is why one `normalizeDamage` serves both.
  { key: "secondary_damage", param: "secondary_damage", vocab: "damage" },
] as const;

/** How many options to show before folding the rest into a `<details>`. Six
 * covers the common choices in every dimension we measured while keeping the
 * whole panel scannable; colour and damage have 17 and 25. */
const VISIBLE_OPTIONS = 6;

export interface FilterPanelLabels {
  heading: string;
  reset: string;
  showMore: string;
  /** Group headings, keyed by dimension. */
  groups: Record<string, string>;
  /** Option labels, keyed by `dimension.value`, e.g. `fuel.gasoline`. */
  options: Record<string, string>;
}

function Option({
  label,
  count,
  active,
  href,
}: {
  label: string;
  count: number;
  active: boolean;
  href: { pathname: string; query: Record<string, string> };
}) {
  return (
    <Link
      href={href}
      className={`flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm transition-colors ${
        active
          ? "bg-amber-50 font-semibold text-amber-700"
          : "text-char-700 hover:bg-char-50"
      }`}
    >
      <span className="flex min-w-0 items-center gap-2">
        <span
          aria-hidden
          className={`h-3.5 w-3.5 shrink-0 rounded-[3px] border ${
            active ? "border-amber-500 bg-amber-500" : "border-char-300"
          }`}
        />
        <span className="truncate">{label}</span>
      </span>
      <span className="shrink-0 tabular-nums text-xs text-char-400">
        {count.toLocaleString()}
      </span>
    </Link>
  );
}

export default function FilterPanel({
  facets,
  query,
  labels,
}: {
  facets: SearchFacets;
  /** The current URL's query, already normalised by the page. */
  query: Record<string, string>;
  labels: FilterPanelLabels;
}) {
  const anyActive = DIMENSIONS.some((d) => query[d.param]);

  return (
    <aside className="rounded-2xl border border-char-200 bg-white p-4">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-bold text-char-900">{labels.heading}</h2>
        {anyActive && (
          <Link
            href={{
              pathname: "/search",
              // Keeps the text query and category, drops every facet — the
              // button means "clear the filters", not "start again".
              query: Object.fromEntries(
                Object.entries(query).filter(
                  ([k]) => !DIMENSIONS.some((d) => d.param === k) && k !== "cursor"
                )
              ),
            }}
            className="text-xs font-semibold text-amber-600 hover:text-amber-700"
          >
            {labels.reset}
          </Link>
        )}
      </div>

      {DIMENSIONS.map((d) => {
        const options = facets[d.key] ?? [];
        if (options.length === 0) return null;
        const selected = parseSelected(query[d.param]);
        const head = options.slice(0, VISIBLE_OPTIONS);
        const tail = options.slice(VISIBLE_OPTIONS);

        return (
          <div key={d.key} className="mt-4 border-t border-char-100 pt-3 first:mt-3">
            <h3 className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-char-500">
              {labels.groups[d.key] ?? d.key}
            </h3>
            {head.map((o) => (
              <Option
                key={o.value}
                label={d.vocab ? (labels.options[`${d.vocab}.${o.value}`] ?? o.value) : o.value}
                count={o.count}
                active={selected.has(o.value)}
                href={toggleHref(query, d.param, o.value)}
              />
            ))}
            {tail.length > 0 && (
              // Native disclosure rather than client state: the panel stays a
              // server component and still works with JavaScript off.
              <details className="group">
                <summary className="cursor-pointer list-none px-2 py-1.5 text-xs font-semibold text-amber-600 hover:text-amber-700">
                  {labels.showMore.replace("{count}", String(tail.length))}
                </summary>
                {tail.map((o) => (
                  <Option
                    key={o.value}
                    label={d.vocab ? (labels.options[`${d.vocab}.${o.value}`] ?? o.value) : o.value}
                    count={o.count}
                    active={selected.has(o.value)}
                    href={toggleHref(query, d.param, o.value)}
                  />
                ))}
              </details>
            )}
          </div>
        );
      })}
    </aside>
  );
}
