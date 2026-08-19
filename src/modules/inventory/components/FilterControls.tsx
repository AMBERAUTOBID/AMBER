"use client";

import { useState } from "react";
import { useRouter } from "@/i18n/navigation";
import type { FacetOption } from "@/modules/inventory/api/source";
import { YEAR_OPTIONS } from "@/modules/inventory/model/vehicleData";
import { treeFromOptions } from "@/modules/inventory/model/modelFacets";
import { ODO_MIN, ODO_MAX, ODO_STEP, formatMiles } from "@/modules/inventory/model/odometerRange";
import ScrollableSelect from "@/shared/ui/ScrollableSelect";
import ModelSelect from "@/modules/inventory/components/ModelSelect";
import RangeSlider from "@/modules/inventory/components/RangeSlider";

/**
 * The four filters that cannot be a list of links: make, model, year, mileage.
 *
 * WHY AN ISLAND RATHER THAN MORE OF THE PANEL. `FilterPanel` is a server
 * component on purpose — every option is a `<Link>`, so the address bar is the
 * only source of truth, back does what it looks like it does, and the whole
 * thing works with JavaScript off. That shape is right for a dimension with six
 * options and wrong for these four:
 *
 *  - **Make** has 1,316 entries. As links that is a wall you scroll; it needs a
 *    type-to-filter box, and a box needs state.
 *  - **Model** is two levels deep and 171 rows for one marque, and it must not
 *    exist at all until a make is chosen — the owner's ask, and the only shape
 *    in which a model picker is honest, since the same label means different
 *    cars under different marques.
 *  - **Year** is a from/to pair over 45 values. As links that is 90 rows for a
 *    filter people state exactly.
 *  - **Mileage** is a range the visitor types or drags, which the fixed bands it
 *    replaces could never be. Dragging a thumb produces dozens of intermediate
 *    values and exactly one of them is a search.
 *
 * So the panel keeps its links and this sits inside it as the one client
 * component. Everything it knows arrives as props from the server: the make
 * list and the model tree are COUNTED UNDER THE CURRENT FILTERS (see
 * `makeModelFacets`), which is why there is no fetch here and no spinner — the
 * lists are already on the page when it renders.
 *
 * ⚠️ THESE FOUR NEED JAVASCRIPT and the rest of the panel does not. That is a
 * real reduction for a visitor without it, and it is bounded: the facet lists,
 * the chips and paging still work, and the site's only other way into a search
 * — the widget at the top of the page — has always required JavaScript, so
 * nobody could have reached this page without it anyway.
 */

/**
 * From five lots up, with the rest behind "show all" — the same rule the search
 * widget uses, and for the same reason.
 *
 * The tail is genuine vendor debris: `8LBE`, `2005`, `17 1/2`, `ACUR` (a
 * truncated ACURA), one lot each. It matters more here than in the widget,
 * because this list is sorted for reading rather than by inventory and the
 * numeric collation puts `17 1/2` and `2005` at the very TOP — the first thing
 * a visitor opening the picker would see. Hidden outright those ~90 cars become
 * unreachable, so they are one click away instead.
 */
const MAKE_FLOOR = 5;

export interface FilterControlsLabels {
  make: string;
  model: string;
  makePlaceholder: string;
  modelPlaceholder: string;
  searchFilterPlaceholder: string;
  showAllMakes: string;
  year: string;
  yearFrom: string;
  yearTo: string;
  odometer: string;
  odometerReset: string;
}

export default function FilterControls({
  query,
  makes,
  models,
  labels,
}: {
  /** The current URL's query, exactly as the panel's links carry it. */
  query: Record<string, string>;
  makes: FacetOption[];
  /** Absent until a make is chosen — see the note above. */
  models?: FacetOption[];
  labels: FilterControlsLabels;
}) {
  const router = useRouter();
  const [showAllMakes, setShowAllMakes] = useState(false);

  const make = query.make ?? "";
  const model = query.model ?? "";

  /**
   * Mileage as it currently stands, held locally so dragging is smooth.
   *
   * Seeded from the URL, and NOT kept in step with it afterwards — after a
   * commit the page re-renders with the new query and this component keeps its
   * place in the tree, so the state that survives is already the right one.
   * Re-syncing on every render would fight the drag.
   */
  const [odo, setOdo] = useState<[number, number]>([
    Number(query.odoMin) || ODO_MIN,
    Number(query.odoMax) || ODO_MAX,
  ]);

  /**
   * One navigation, with the given params changed and everything else kept.
   *
   * `undefined` deletes a param rather than writing an empty one, so the server
   * never has to decide what `make=` means. `cursor` always goes: page 5 of the
   * old result set does not exist once the filter changed, and carrying it is
   * how a visitor lands on an empty page immediately after narrowing.
   */
  function go(changes: Record<string, string | undefined>) {
    const next: Record<string, string> = { ...query };
    delete next.cursor;
    for (const [k, v] of Object.entries(changes)) {
      if (v === undefined || v === "") delete next[k];
      else next[k] = v;
    }
    // scroll: false for the same reason the panel links carry it — a filter
    // change refines the page in place rather than starting a new visit.
    router.push({ pathname: "/search", query: next }, { scroll: false });
  }

  const common = makes.filter((m) => m.count >= MAKE_FLOOR);
  const hiddenMakes = makes.length - common.length;
  const shown = showAllMakes ? makes : common;
  // The chosen make has to be in the list even if the current filters have cut
  // it below the floor, or the select would render its own value as missing and
  // ScrollableSelect would helpfully clear it.
  const makeOptions = shown.some((m) => m.value === make)
    ? shown.map((m) => m.value)
    : [make, ...shown.map((m) => m.value)].filter(Boolean);
  const makeCounts = new Map(makes.map((m) => [m.value, m.count]));

  const tree = models ? treeFromOptions(models) : [];

  return (
    <div className="space-y-3">
      <div>
        <h3 className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-char-500">
          {labels.make}
        </h3>
        <ScrollableSelect
          value={make}
          // Changing marque drops the model in the same navigation: a 3 Series
          // under Audi is not a narrower search, it is an empty one.
          onChange={(v) => go({ make: v || undefined, model: undefined })}
          options={makeOptions}
          placeholder={labels.makePlaceholder}
          searchPlaceholder={labels.searchFilterPlaceholder}
          getLabel={(opt) => {
            const n = makeCounts.get(opt);
            return n === undefined ? opt : `${opt} (${n.toLocaleString()})`;
          }}
          footer={
            !showAllMakes && hiddenMakes > 0 ? (
              <button
                type="button"
                onClick={() => setShowAllMakes(true)}
                className="w-full px-3 py-2 text-left text-xs font-semibold text-amber-700 hover:bg-amber-50"
              >
                {labels.showAllMakes.replace("{count}", hiddenMakes.toLocaleString())}
              </button>
            ) : null
          }
        />
      </div>

      {/* APPEARS ONLY ONCE A MAKE IS CHOSEN — the owner's ask. A disabled
          picker sitting there permanently was the alternative and it is worse:
          it occupies the same space, invites the same click, and answers it
          with nothing. */}
      {make && (
        <div>
          <h3 className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-char-500">
            {labels.model}
          </h3>
          <ModelSelect
            value={model}
            onChange={(v) => go({ model: v || undefined })}
            tree={tree}
            placeholder={labels.modelPlaceholder}
            searchPlaceholder={labels.searchFilterPlaceholder}
          />
        </div>
      )}

      {/* TWO SELECTS, NOT A SECOND SLIDER, and it is the shape Copart uses.
          A model year is a number people know exactly — "2015 and newer", not
          "somewhere around here" — and a 45-stop track is a poor way to say
          2015 when a list says it in one click. Mileage is the opposite: an
          approximate ceiling, which is why that one is a slider.

          Not counted, deliberately. Every other option in this panel carries a
          number, and a year cannot honestly: a from/to pair is one filter made
          of two independent choices, so a count beside "2015" would have to
          describe either every lot from 2015 alone or every lot from 2015
          onwards, and both read as a promise about what clicking it returns. */}
      <div className="border-t border-char-100 pt-3">
        <h3 className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-char-500">
          {labels.year}
        </h3>
        <div className="grid grid-cols-2 gap-2">
          <ScrollableSelect
            value={query.yearFrom ?? ""}
            onChange={(v) => go({ yearFrom: v || undefined })}
            options={YEAR_OPTIONS}
            placeholder={labels.yearFrom}
            searchPlaceholder={labels.searchFilterPlaceholder}
            menuWidth="trigger"
          />
          <ScrollableSelect
            value={query.yearTo ?? ""}
            onChange={(v) => go({ yearTo: v || undefined })}
            options={YEAR_OPTIONS}
            placeholder={labels.yearTo}
            searchPlaceholder={labels.searchFilterPlaceholder}
            menuWidth="trigger"
          />
        </div>
      </div>

      <div className="border-t border-char-100 pt-3">
        <RangeSlider
          compact
          min={odo[0]}
          max={odo[1]}
          floor={ODO_MIN}
          ceiling={ODO_MAX}
          step={ODO_STEP}
          format={formatMiles}
          onChange={(lo, hi) => setOdo([lo, hi])}
          // The only place a mileage search is actually run. Either end left at
          // the end of the track means "no bound" and is dropped from the URL
          // rather than written out as 0 or 500,000 — so a shared link says what
          // the visitor chose, and the chip above the results does too.
          onCommit={(lo, hi) =>
            go({
              odoMin: lo > ODO_MIN ? String(lo) : undefined,
              odoMax: hi < ODO_MAX ? String(hi) : undefined,
            })
          }
          title={labels.odometer}
          resetLabel={labels.odometerReset}
          minAriaLabel={`${labels.odometer} — min`}
          maxAriaLabel={`${labels.odometer} — max`}
        />
      </div>
    </div>
  );
}
