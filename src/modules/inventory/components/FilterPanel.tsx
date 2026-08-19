import { Link } from "@/i18n/navigation";
import { CaretDown } from "@phosphor-icons/react/dist/ssr";
import type { SearchFacets } from "@/modules/inventory/api";
import { parseSelected, toggleHref } from "@/modules/inventory/model/filterQuery";
import FilterControls, {
  type FilterControlsLabels,
} from "@/modules/inventory/components/FilterControls";

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
export const DIMENSIONS = [
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

/**
 * How many individual values are ticked across every dimension.
 *
 * Counts values, not dimensions: two makes and a colour reads as 3, which is
 * what a shopper means by "I have three filters on". Lives here because
 * DIMENSIONS is the list it has to agree with, and a copy elsewhere would
 * drift the first time a dimension is added.
 *
 * Counts what this panel renders, which is now the make, the model and the
 * mileage range as well as the facets — all three are set from inside the
 * panel, so a collapsed panel on a phone has to admit to them. Engine size and
 * retail value are gone from the UI entirely; a hand-typed URL can still set
 * them and they are deliberately not counted, because opening the panel would
 * not show them.
 */
export function countActiveFilters(query: Record<string, string>): number {
  const facetCount = DIMENSIONS.reduce((n, d) => n + parseSelected(query[d.param]).size, 0);
  return (
    facetCount +
    // One, not two: min and max are a single choice to the person who made it,
    // and the chip above the results shows each range as one chip for the same
    // reason.
    (query.odoMin || query.odoMax ? 1 : 0) +
    (query.yearFrom || query.yearTo ? 1 : 0) +
    (query.make ? 1 : 0) +
    (query.model ? 1 : 0)
  );
}

/**
 * A dot of actual paint beside each colour option.
 *
 * Colour is the one dimension where the word is a poor label — "Beige" and
 * "Gold" are the same thought until you see them, and a Lithuanian or Russian
 * reader is matching a translated word to a car they picture rather than to a
 * name they use daily. The competitor shows swatches for the same reason.
 *
 * Values are the paint, not the brand palette, so they are literal hex rather
 * than Tailwind tokens. `white` needs the ring every swatch carries or it
 * disappears against the panel.
 */
const COLOR_SWATCH: Record<string, string> = {
  white: "#FFFFFF",
  black: "#1F2124",
  gray: "#9AA0A6",
  silver: "#C9CED4",
  blue: "#2563EB",
  red: "#DC2626",
  green: "#16A34A",
  brown: "#7A4A24",
  beige: "#E0D2B4",
  gold: "#D4AF37",
  burgundy: "#7B1E3A",
  yellow: "#F5C518",
  orange: "#EA6A0C",
  purple: "#7E22CE",
  teal: "#0D9488",
  pink: "#EC4899",
};

/** Two-tone and multi-colour lots: no single swatch is honest, so show that
 * it is more than one rather than picking a winner. */
const MULTI_SWATCH = "conic-gradient(#DC2626, #F5C518, #16A34A, #2563EB, #DC2626)";

/**
 * The params the controls at the top of the panel own, beyond the facets.
 *
 * ONE LIST, THREE READERS — the reset link, the "is anything on" test and the
 * badge count. Written out separately, they drifted the moment year was added:
 * the reset link kept clearing mileage and quietly left the year behind, which
 * is the kind of half-clear that reads as a broken button rather than as a bug.
 *
 * `q` and `category` are deliberately NOT here. They are where the visitor
 * browsed to rather than what they narrowed by, and the panel's reset means
 * "clear the filters", not "start again" — the chips above the results carry
 * "clear all" for that.
 */
const PANEL_RANGE_PARAMS = ["odoMin", "odoMax", "yearFrom", "yearTo", "make", "model"] as const;

/** How many options to show before folding the rest into a `<details>`. Six
 * covers the common choices in every dimension we measured while keeping the
 * whole panel scannable; colour and damage have 17 and 25. */
const VISIBLE_OPTIONS = 6;

/**
 * The dimensions that arrive folded shut — the owner's list, 2026-08-19.
 *
 * The panel had grown to twelve groups stacked open, which is a very long
 * scroll before the first car, and most of it is detail a visitor consults
 * rather than reads. Folded, the sidebar becomes a menu of what CAN be narrowed
 * instead of a wall of everything that could be.
 *
 * ⚠️ EVERY GROUP IS COLLAPSIBLE — this set only decides the STARTING state.
 * The three absent from it (auction, condition, gearbox) arrive open because
 * they have 2–3 options each and are what a buyer narrows on first, but the
 * owner's follow-up call on 2026-08-19 was that open-by-default must not mean
 * pinned-open: a visitor who does not care about them can fold them away. One
 * mechanism, one look, two starting positions.
 */
const COLLAPSED_BY_DEFAULT = new Set<string>([
  "vehicle_class",
  "title",
  "damage",
  "body_type",
  "fuel",
  "drive",
  "cylinders",
  "secondary_damage",
  "color",
]);

export interface FilterPanelLabels {
  heading: string;
  reset: string;
  showMore: string;
  /** Group headings, keyed by dimension. */
  groups: Record<string, string>;
  /**
   * Option labels, nested by dimension and then value — `options.fuel.gasoline`.
   *
   * NESTED RATHER THAN A DOTTED KEY, AND IT HAS TO BE. next-intl reads "." in a
   * message key as nesting and refuses a literal one, so the flat
   * `"fuel.gasoline"` this started as threw INVALID_KEY over all 89 options and
   * took the dev server down with it. It only failed in development — the
   * production bundle skips that validation — which is the worst shape for a
   * bug: the site builds, and nobody can run it locally.
   */
  options: Record<string, Record<string, string>>;
  /**
   * The make/model/mileage island's own labels.
   *
   * Optional so `ActiveFilters`, which extends this interface for the chips and
   * has no controls to label, does not have to carry them — and so the panel's
   * own test fixtures stay about facets.
   */
  controls?: FilterControlsLabels;
}

/**
 * The translated label for one option, falling back to the raw database value.
 *
 * The fallback is deliberate: a value the auctions introduce next month appears
 * in the facets before anyone writes a translation for it, and showing
 * `sport_utility` is honest where showing nothing would silently drop a filter
 * the visitor can see results for.
 */
export function optionLabel(labels: FilterPanelLabels, vocab: string | null, value: string): string {
  if (!vocab) return value;
  return labels.options[vocab]?.[value] ?? value;
}

function Option({
  label,
  count,
  active,
  href,
  swatch,
}: {
  label: string;
  count: number;
  active: boolean;
  href: { pathname: string; query: Record<string, string> };
  /** A CSS colour or gradient, on the colour dimension only. */
  swatch?: string;
}) {
  return (
    <Link
      href={href}
      // ⚠️ scroll={false} on every filter action, panel and chips alike. A tick
      // is a refinement of the page the visitor is already reading, and the
      // default jump-to-top threw them back to the hero and made them scroll
      // down to see what their own click did. Pagination keeps the default —
      // "next page" genuinely means "start of the next list".
      scroll={false}
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
        {swatch && (
          // Decorative: the option is already named in the text beside it, so a
          // screen reader gains nothing from the colour and would only repeat.
          <span
            aria-hidden
            className="h-3.5 w-3.5 shrink-0 rounded-full ring-1 ring-inset ring-black/15"
            style={{ background: swatch }}
          />
        )}
        <span className="truncate">{label}</span>
      </span>
      <span className="shrink-0 tabular-nums text-xs text-char-500">
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
  const anyActive =
    DIMENSIONS.some((d) => query[d.param]) ||
    // Everything the controls below can set — see the reset link's own note.
    PANEL_RANGE_PARAMS.some((k) => query[k]);

  return (
    <aside className="rounded-2xl border border-char-200 bg-white p-4">
      <div className="flex items-baseline justify-end lg:justify-between">
        {/* Below lg the disclosure button above already says "Filters", and
            repeating it here read as two headings for one panel. The reset
            link keeps its place either way, which is why the row switches to
            justify-end rather than disappearing with the heading. */}
        <h2 className="hidden text-sm font-bold text-char-900 lg:block">
          {labels.heading}
        </h2>
        {anyActive && (
          <Link
            href={{
              pathname: "/search",
              // Keeps the text query and category, drops every facet — the
              // button means "clear the filters", not "start again".
              query: Object.fromEntries(
                Object.entries(query).filter(
                  ([k]) =>
                    !DIMENSIONS.some((d) => d.param === k) &&
                    k !== "cursor" &&
                    !PANEL_RANGE_PARAMS.includes(k as (typeof PANEL_RANGE_PARAMS)[number])
                )
              ),
            }}
            scroll={false}
            className="text-xs font-semibold text-amber-600 hover:text-amber-700"
          >
            {labels.reset}
          </Link>
        )}
      </div>

      {/* FIRST, and it is the order buyers actually narrow in: which car, then
          which version of it, then how far it has been driven. Everything below
          is a property of a lot; these three are the lot itself.

          ⚠️ THE MILEAGE BANDS THAT USED TO BE HERE ARE GONE. They were five
          links — "50,000–100,000 mi" and so on — measured so that each carried
          real inventory, and the owner rejected the shape outright: a buyer
          knows the mileage they will accept and wants to say it, not to pick
          the nearest box. `ODOMETER_BAND_SQL` still counts them for the facet
          query and nothing renders them; the counts are cheap and a histogram
          behind the track is the obvious next use for them.

          Rendered only when the labels are supplied — see FilterPanelLabels. */}
      {labels.controls && (
        <div className="mt-3 border-t border-char-100 pt-3">
          <FilterControls
            query={query}
            makes={facets.make ?? []}
            models={facets.model}
            labels={labels.controls}
          />
        </div>
      )}

      {DIMENSIONS.map((d) => {
        const options = facets[d.key] ?? [];
        if (options.length === 0) return null;
        const selected = parseSelected(query[d.param]);
        const head = options.slice(0, VISIBLE_OPTIONS);
        const tail = options.slice(VISIBLE_OPTIONS);

        /**
         * ⚠️ TWO THINGS FORCE A GROUP OPEN ON ARRIVAL, and only on arrival:
         * not being in the folded-by-default set, or holding a ticked value.
         * The second matters most on a shared link or the back button — a
         * closed row with no sign it is doing anything makes the result count
         * unexplainable without opening every group in turn. The chips above
         * the results say what is on; this says WHERE it is. After first
         * paint the triangle is the visitor's, for every group alike.
         */
        const startOpen = !COLLAPSED_BY_DEFAULT.has(d.key) || selected.size > 0;
        const body = (
          <>
            {head.map((o) => (
              <Option
                key={o.value}
                label={optionLabel(labels, d.vocab, o.value)}
                count={o.count}
                active={selected.has(o.value)}
                href={toggleHref(query, d.param, o.value)}
                swatch={d.vocab === "color" ? (COLOR_SWATCH[o.value] ?? MULTI_SWATCH) : undefined}
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
                    label={optionLabel(labels, d.vocab, o.value)}
                    count={o.count}
                    active={selected.has(o.value)}
                    href={toggleHref(query, d.param, o.value)}
                swatch={d.vocab === "color" ? (COLOR_SWATCH[o.value] ?? MULTI_SWATCH) : undefined}
                  />
                ))}
              </details>
            )}
          </>
        );

        const heading = labels.groups[d.key] ?? d.key;

        return (
          <div key={d.key} className="mt-4 border-t border-char-100 pt-3 first:mt-3">
            {/* Native `<details>` for EVERY group, like the "show more" tail
                below it: the panel stays a server component, the fold costs no
                JavaScript, and it keeps working with scripting off. The set
                only decides who starts open — one mechanism, two positions,
                and a visitor can fold anything out of their way. */}
            <details open={startOpen} className="group/dim">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-char-500 transition-colors hover:text-amber-700">
                <span className="flex items-center gap-1.5">
                  {heading}
                  {/* How many are ticked in a group you cannot see into.
                      Without it a closed group is indistinguishable from an
                      untouched one. */}
                  {selected.size > 0 && (
                    <span className="rounded-full bg-amber-600 px-1.5 text-[10px] font-bold text-white tabular-nums">
                      {selected.size}
                    </span>
                  )}
                </span>
                <CaretDown
                  size={12}
                  weight="bold"
                  aria-hidden
                  className="shrink-0 transition-transform group-open/dim:rotate-180"
                />
              </summary>
              <div className="mt-1.5">{body}</div>
            </details>
          </div>
        );
      })}
    </aside>
  );
}
