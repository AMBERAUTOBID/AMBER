"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  MagnifyingGlass,
  CheckCircle,
  Car,
  Motorcycle,
  Truck,
  DotsThreeCircle,
  Lightning,
} from "@phosphor-icons/react/dist/ssr";
import { clsx } from "clsx";
import { useRouter } from "@/i18n/navigation";
import {
  VEHICLE_CATEGORIES,
  MAKES_BY_CATEGORY,
  MODELS_BY_CATEGORY,
  YEAR_OPTIONS,
  type VehicleCategory,
} from "@/modules/inventory/model/vehicleData";
import { MORE_TYPE_TO_APIBARA_TYPE } from "@/modules/inventory/model/searchQuery";
import ScrollingPlaceholder from "@/shared/ui/ScrollingPlaceholder";
import ScrollableSelect from "@/shared/ui/ScrollableSelect";
import ModelSelect from "@/modules/inventory/components/ModelSelect";
import type { ModelGroup } from "@/modules/inventory/model/modelTree";
// The odometer, engine-size and retail-value sliders used to live here. Mileage
// moved into the filter panel as counted bands — one click instead of dragging
// two thumbs and pressing Search — and engine size and retail value were
// dropped entirely for now. This box is back to what it is for: pick a type,
// a make, a model, a year span, and go.
//
// The URL params still work. `engineFrom`, `retailMin` and the rest are read by
// the search page exactly as before, so shared links keep resolving; there is
// simply no control that writes them.

const CATEGORY_ICONS: Record<VehicleCategory, typeof Car> = {
  automobile: Car,
  motorcycle: Motorcycle,
  truck: Truck,
  more: DotsThreeCircle,
};

function AuctionToggle({
  checked,
  onChange,
  label,
  activeClass,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  activeClass: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={checked}
      onClick={() => onChange(!checked)}
      className={clsx(
        "inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full border px-3.5 py-2 text-sm font-semibold transition-colors select-none",
        checked ? activeClass : "border-char-200 bg-white text-char-500 hover:border-char-300"
      )}
    >
      {checked ? (
        <CheckCircle size={16} weight="fill" className="shrink-0" />
      ) : (
        <span className="h-3.5 w-3.5 shrink-0 rounded-full border-2 border-current" />
      )}
      {label}
    </button>
  );
}

export default function SearchWidget({
  labels,
  variant = "light",
}: {
  labels: {
    vinPlaceholder: string;
    copartToggle: string;
    iaaiToggle: string;
    searchButton: string;
    vehicleTypes: Record<VehicleCategory, string>;
    yearFrom: string;
    yearTo: string;
    buyNow: string;
    browsePrompt: string;
    makePlaceholder: string;
    showAllMakes: string;
    typePlaceholder: string;
    modelPlaceholder: string;
    searchFilterPlaceholder: string;
    odometer: string;
    odometerReset: string;
    engine: string;
    engineReset: string;
    retail: string;
    retailReset: string;
    retailNote: string;
  };
  variant?: "light" | "elevated";
}) {
  const [quickQuery, setQuickQuery] = useState("");
  const [category, setCategory] = useState<VehicleCategory | null>(null);
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [yearFrom, setYearFrom] = useState("");
  const [yearTo, setYearTo] = useState("");
  const [buyNowOnly, setBuyNowOnly] = useState(false);
  const [copartOn, setCopartOn] = useState(true);
  const [iaaiOn, setIaaiOn] = useState(true);

  const router = useRouter();

  /**
   * True for a 17-character VIN (the standard excludes I, O and Q so they
   * can't be confused with 1 and 0) or a bare 6-10 digit auction lot number.
   * Anything else is treated as free-text and goes to the keyword search.
   */
  function isLotIdentifier(term: string): boolean {
    const t = term.replace(/\s+/g, "");
    return /^[A-HJ-NPR-Z0-9]{17}$/i.test(t) || /^\d{6,10}$/.test(t);
  }

  function platformParam(): string | undefined {
    if (copartOn && !iaaiOn) return "copart";
    if (iaaiOn && !copartOn) return "iaai";
    return undefined;
  }

  function handleQuickSearch(e: React.FormEvent) {
    e.preventDefault();
    const term = quickQuery.trim();
    if (!term || (!copartOn && !iaaiOn)) return;

    // A VIN or lot number identifies exactly one lot, so it goes straight to
    // that lot's page rather than through the keyword search. This is also
    // the only way to reach an already-sold car: Apibara's search endpoint
    // returns live lots only, while the per-lot endpoint resolves both VINs
    // and lot numbers and keeps working after the sale has run.
    if (isLotIdentifier(term)) {
      router.push(`/vehicle/${encodeURIComponent(term.toUpperCase())}`);
      return;
    }

    const platform = platformParam();
    router.push({
      pathname: "/search",
      query: { q: term, ...(platform ? { platform } : {}) },
    });
  }

  function handleCategorySearch() {
    if (!category || (!copartOn && !iaaiOn)) return;

    const query: Record<string, string> = {};
    const platform = platformParam();
    if (platform) query.platform = platform;

    if (category === "more") {
      if (make) query.type = MORE_TYPE_TO_APIBARA_TYPE[make] ?? make;
    } else {
      // Automobile/Truck/Motorcycle share real make names (Honda, Ford...),
      // so the category itself is passed through - the search page uses it
      // to filter by the right vehicle type(s) when no specific model
      // narrows things down already.
      query.category = category;
      if (make) query.make = make;
      if (model) query.model = model;
    }
    if (yearFrom) query.yearFrom = yearFrom;
    if (yearTo) query.yearTo = yearTo;
    if (buyNowOnly) query.buyNow = "1";

    router.push({ pathname: "/search", query });
  }

  function selectCategory(cat: VehicleCategory) {
    const next = category === cat ? null : cat;
    setCategory(next);
    // Yesterday's makes belong to yesterday's tab: without this, switching from
    // Automobile to Motorcycle shows car marques until the new list lands.
    setCatalogMakes([]);
    setShowAllMakes(false);
    setMake("");
    setModel("");
    setYearFrom("");
    setYearTo("");
  }

  /**
   * THE LISTS COME FROM OUR OWN CATALOGUE NOW, not from a typed constant.
   *
   * `vehicleData.ts` held 14 BMW models where the rows hold 171, and ~60 makes
   * against 1,316 — X6, X2, X4, 328i and 535i simply could not be picked. It
   * stays as the fallback, because when Apibara serves search the `auction_*`
   * tables are empty and `/api/catalog` answers with nothing; the widget must
   * still work then.
   */
  const [catalogMakes, setCatalogMakes] = useState<{ make: string; count: number }[]>([]);
  /**
   * The tree is stored WITH the make it belongs to, and "loading" is derived
   * from the two disagreeing rather than kept as its own flag.
   *
   * Two things fall out of that. Switching make can never show the previous
   * make's models for a frame while the new ones arrive — the tree simply does
   * not apply until its label matches. And there is no `setLoading(true)` to
   * run synchronously inside the effect, which is a cascading render the lint
   * rule is right to refuse.
   */
  const [loadedTree, setLoadedTree] = useState<{ make: string; groups: ModelGroup[] }>({
    make: "",
    groups: [],
  });
  const [showAllMakes, setShowAllMakes] = useState(false);
  const modelsReady = loadedTree.make === make;
  const modelTree = modelsReady ? loadedTree.groups : [];
  const loadingModels = make !== "" && !modelsReady;

  useEffect(() => {
    // "More" is deliberately left on the built-in list. Its picker does not
    // choose a make at all — it chooses a vehicle TYPE, which the search page
    // receives as `type=` — so filling it with boat manufacturers would send
    // the wrong parameter and return nothing.
    if (!category || category === "more") return;
    let live = true;
    fetch(`/api/catalog?category=${category}`)
      .then((r) => (r.ok ? r.json() : { makes: [] }))
      .then((d: { makes?: { make: string; count: number }[] }) => {
        if (live) setCatalogMakes(d.makes ?? []);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [category]);

  useEffect(() => {
    // No make, nothing to fetch — and nothing to clear either: the render below
    // reads an empty tree straight from `make`, so there is no state to reset
    // and no cascading render to trigger.
    if (!make) return;
    let live = true;
    fetch(`/api/catalog?make=${encodeURIComponent(make)}&category=${category ?? ""}`)
      .then((r) => (r.ok ? r.json() : { tree: [] }))
      .then((d: { tree?: ModelGroup[] }) => {
        if (live) setLoadedTree({ make, groups: d.tree ?? [] });
      })
      .catch(() => {
        // An empty tree for this make, not a stuck spinner: the picker says
        // "—" and the visitor can still search on the make alone.
        if (live) setLoadedTree({ make, groups: [] });
      });
    return () => {
      live = false;
    };
    // `category` scopes the query — the same marque offers different models
    // under Automobile and Motorcycle.
  }, [make, category]);

  /**
   * From five lots up, with the rest behind "show all" — the owner's call.
   *
   * The tail is real vendor debris: `8LBE`, `2005`, `17 1/2`, `ACUR` (a
   * truncated ACURA), one lot each. Hiding it outright would make ~90 cars
   * unreachable through this box; showing it by default puts junk in front of
   * everyone. So it is one click away and nothing is lost.
   */
  const MAKE_FLOOR = 5;
  const commonMakes = catalogMakes.filter((m) => m.count >= MAKE_FLOOR);
  const hiddenMakes = catalogMakes.length - commonMakes.length;
  const makeCounts = new Map(catalogMakes.map((m) => [m.make, m.count]));
  const makeOptions =
    catalogMakes.length > 0
      ? (showAllMakes ? catalogMakes : commonMakes).map((m) => m.make)
      : MAKES_BY_CATEGORY[category ?? "automobile"];

  const usingCatalog = catalogMakes.length > 0;
  const hasModelData = usingCatalog
    ? true
    : category
      ? Object.keys(MODELS_BY_CATEGORY[category]).length > 0
      : false;
  const fallbackModels =
    category && make ? (MODELS_BY_CATEGORY[category][make] ?? []) : [];

  return (
    <div
      className={
        variant === "elevated"
          ? "rounded-3xl bg-white p-5 shadow-2xl shadow-char-900/25 sm:p-6"
          : "rounded-3xl border border-char-200 bg-white p-5 sm:p-6"
      }
    >
      {/* Quick VIN/lot search */}
      <form onSubmit={handleQuickSearch} className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <MagnifyingGlass
            size={18}
            className="pointer-events-none absolute left-4 top-1/2 z-10 -translate-y-1/2 text-char-500"
          />
          <input
            type="text"
            value={quickQuery}
            onChange={(e) => setQuickQuery(e.target.value)}
            className="w-full rounded-xl border border-char-200 bg-char-50 py-3 pl-11 pr-4 text-sm text-char-900 outline-none transition-colors focus:border-amber-400 focus:bg-white focus:ring-2 focus:ring-amber-100"
          />
          <ScrollingPlaceholder
            text={labels.vinPlaceholder}
            active={quickQuery.length === 0}
            className="pl-11 pr-4 text-sm"
          />
        </div>
        <button
          type="submit"
          disabled={!copartOn && !iaaiOn}
          className="shrink-0 rounded-xl bg-amber-600 px-7 py-3 text-sm font-semibold text-white transition-colors hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {labels.searchButton}
        </button>
      </form>

      <p className="mt-4 text-center text-xs font-semibold uppercase tracking-wider text-char-500">
        {labels.browsePrompt}
      </p>

      {/* Category blocks */}
      <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {VEHICLE_CATEGORIES.map((cat) => {
          const Icon = CATEGORY_ICONS[cat];
          const active = category === cat;
          return (
            <button
              key={cat}
              type="button"
              aria-pressed={active}
              onClick={() => selectCategory(cat)}
              className={clsx(
                "flex flex-col items-center gap-1.5 rounded-xl border px-3 py-3.5 text-sm font-semibold transition-all",
                active
                  ? "border-amber-500 bg-amber-600 text-white shadow-md shadow-amber-900/20"
                  : "border-char-200 bg-white text-char-600 hover:border-amber-300 hover:bg-amber-50"
              )}
            >
              <Icon size={22} weight={active ? "fill" : "regular"} />
              {labels.vehicleTypes[cat]}
            </button>
          );
        })}
      </div>

      {/* Expandable filter panel */}
      <AnimatePresence initial={false} mode="wait">
        {category && (
          <motion.div
            key={category}
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="mt-4 space-y-3 rounded-2xl border border-amber-200 bg-amber-50/40 p-4">
              <div className={clsx("grid grid-cols-1 gap-3", hasModelData && "sm:grid-cols-2")}>
                <ScrollableSelect
                  value={make}
                  onChange={(v) => {
                    setMake(v);
                    setModel("");
                  }}
                  options={makeOptions}
                  placeholder={category === "more" ? labels.typePlaceholder : labels.makePlaceholder}
                  searchPlaceholder={labels.searchFilterPlaceholder}
                  // The count is what tells a visitor which of two similar
                  // names is the one with cars behind it.
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
                {hasModelData &&
                  (usingCatalog ? (
                    <ModelSelect
                      value={model}
                      onChange={setModel}
                      tree={make ? modelTree : []}
                      placeholder={labels.modelPlaceholder}
                      searchPlaceholder={labels.searchFilterPlaceholder}
                      loading={loadingModels}
                      disabled={!make}
                    />
                  ) : (
                    <ScrollableSelect
                      value={model}
                      onChange={setModel}
                      options={fallbackModels}
                      placeholder={labels.modelPlaceholder}
                      searchPlaceholder={labels.searchFilterPlaceholder}
                      disabled={!make || fallbackModels.length === 0}
                    />
                  ))}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <ScrollableSelect
                  value={yearFrom}
                  onChange={setYearFrom}
                  options={YEAR_OPTIONS}
                  placeholder={labels.yearFrom}
                  searchPlaceholder={labels.searchFilterPlaceholder}
                />
                <ScrollableSelect
                  value={yearTo}
                  onChange={setYearTo}
                  options={YEAR_OPTIONS}
                  placeholder={labels.yearTo}
                  searchPlaceholder={labels.searchFilterPlaceholder}
                />
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  aria-pressed={buyNowOnly}
                  onClick={() => setBuyNowOnly((v) => !v)}
                  className={clsx(
                    "inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold whitespace-nowrap transition-colors sm:text-sm",
                    buyNowOnly
                      ? "border-amber-500 bg-amber-600 text-white"
                      : "border-char-200 bg-white text-char-500 hover:border-char-300"
                  )}
                >
                  <Lightning size={16} weight={buyNowOnly ? "fill" : "regular"} />
                  {labels.buyNow}
                </button>
                <button
                  type="button"
                  onClick={handleCategorySearch}
                  disabled={!copartOn && !iaaiOn}
                  className="ml-auto shrink-0 rounded-lg bg-char-900 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-char-800 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {labels.searchButton}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="mt-4 flex flex-wrap items-center gap-2.5 border-t border-char-100 pt-4">
        <AuctionToggle
          checked={copartOn}
          onChange={setCopartOn}
          label={labels.copartToggle}
          activeClass="border-amber-500 bg-amber-600 text-white"
        />
        <AuctionToggle
          checked={iaaiOn}
          onChange={setIaaiOn}
          label={labels.iaaiToggle}
          activeClass="border-char-800 bg-char-800 text-white"
        />
      </div>
    </div>
  );
}
