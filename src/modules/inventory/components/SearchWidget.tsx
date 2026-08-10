"use client";

import { useState } from "react";
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
import OdometerRange, { ODO_MIN, ODO_MAX } from "./OdometerRange";
import EngineRange, { ENGINE_MIN, ENGINE_MAX } from "./EngineRange";
import RetailRange, { RETAIL_MIN, RETAIL_MAX } from "./RetailRange";
import { rangeParams } from "@/modules/inventory/model/rangeQuery";

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
        checked ? activeClass : "border-char-200 bg-white text-char-400 hover:border-char-300"
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
  const [odoMin, setOdoMin] = useState(ODO_MIN);
  const [odoMax, setOdoMax] = useState(ODO_MAX);
  const [engineMin, setEngineMin] = useState(ENGINE_MIN);
  const [engineMax, setEngineMax] = useState(ENGINE_MAX);
  const [retailMin, setRetailMin] = useState(RETAIL_MIN);
  const [retailMax, setRetailMax] = useState(RETAIL_MAX);
  const [buyNowOnly, setBuyNowOnly] = useState(false);
  const [copartOn, setCopartOn] = useState(true);
  const [iaaiOn, setIaaiOn] = useState(true);

  const router = useRouter();
  /**
   * Odometer and engine size are shown together, and only once a category is
   * picked. Both are meaningless for "more" — the bucket holding trailers,
   * boats and industrial equipment — where a mileage reading is often absent
   * and an engine size says nothing a buyer of a trailer is looking for.
   */
  const hasRanges = category !== null && category !== "more";
  /**
   * Retail value is offered for "more" as well, unlike the other two: a trailer
   * or a forklift is worth a number even when a mileage reading and an engine
   * size say nothing about it.
   */
  const hasRetail = category !== null;

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
    if (hasRanges) {
      // Each end is sent only if it was actually moved. Leaving the top thumb
      // at its stop means "and above", so sending the ceiling would contradict
      // the "+" the control prints right next to it — see `rangeParams`.
      const odo = rangeParams({ min: odoMin, max: odoMax }, { min: ODO_MIN, max: ODO_MAX });
      if (odo.from) query.odoMin = odo.from;
      if (odo.to) query.odoMax = odo.to;

      const engine = rangeParams(
        { min: engineMin, max: engineMax },
        { min: ENGINE_MIN, max: ENGINE_MAX }
      );
      if (engine.from) query.engineFrom = engine.from;
      if (engine.to) query.engineTo = engine.to;
    }
    if (hasRetail) {
      const retail = rangeParams(
        { min: retailMin, max: retailMax },
        { min: RETAIL_MIN, max: RETAIL_MAX }
      );
      if (retail.from) query.retailMin = retail.from;
      if (retail.to) query.retailMax = retail.to;
    }
    if (buyNowOnly) query.buyNow = "1";

    router.push({ pathname: "/search", query });
  }

  function selectCategory(cat: VehicleCategory) {
    const next = category === cat ? null : cat;
    setCategory(next);
    setMake("");
    setModel("");
    setYearFrom("");
    setYearTo("");
    setOdoMin(ODO_MIN);
    setOdoMax(ODO_MAX);
  }

  const hasModelData = category ? Object.keys(MODELS_BY_CATEGORY[category]).length > 0 : false;
  const modelOptions =
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
            className="pointer-events-none absolute left-4 top-1/2 z-10 -translate-y-1/2 text-char-400"
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
          className="shrink-0 rounded-xl bg-amber-500 px-7 py-3 text-sm font-semibold text-white transition-colors hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {labels.searchButton}
        </button>
      </form>

      <p className="mt-4 text-center text-xs font-semibold uppercase tracking-wider text-char-400">
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
                  ? "border-amber-500 bg-amber-500 text-white shadow-md shadow-amber-900/20"
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
                  options={MAKES_BY_CATEGORY[category]}
                  placeholder={category === "more" ? labels.typePlaceholder : labels.makePlaceholder}
                  searchPlaceholder={labels.searchFilterPlaceholder}
                />
                {hasModelData && (
                  <ScrollableSelect
                    value={model}
                    onChange={setModel}
                    options={modelOptions}
                    placeholder={labels.modelPlaceholder}
                    searchPlaceholder={labels.searchFilterPlaceholder}
                    disabled={!make || modelOptions.length === 0}
                  />
                )}
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

              {hasRanges && (
                <>
                  <OdometerRange
                    min={odoMin}
                    max={odoMax}
                    onChange={(lo, hi) => {
                      setOdoMin(lo);
                      setOdoMax(hi);
                    }}
                    title={labels.odometer}
                    resetLabel={labels.odometerReset}
                  />
                  <EngineRange
                    min={engineMin}
                    max={engineMax}
                    onChange={(lo, hi) => {
                      setEngineMin(lo);
                      setEngineMax(hi);
                    }}
                    title={labels.engine}
                    resetLabel={labels.engineReset}
                  />
                </>
              )}

              {hasRetail && (
                <div>
                  <RetailRange
                    min={retailMin}
                    max={retailMax}
                    onChange={(lo, hi) => {
                      setRetailMin(lo);
                      setRetailMax(hi);
                    }}
                    title={labels.retail}
                    resetLabel={labels.retailReset}
                  />
                  {/* Said out loud rather than left to be discovered. 12% of
                      lots carry no estimated value and drop out the moment this
                      is touched — small enough to be worth the filter, large
                      enough that a visitor deserves to be told. */}
                  <p className="mt-1.5 px-1 text-[11px] leading-snug text-char-500">
                    {labels.retailNote}
                  </p>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  aria-pressed={buyNowOnly}
                  onClick={() => setBuyNowOnly((v) => !v)}
                  className={clsx(
                    "inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold whitespace-nowrap transition-colors sm:text-sm",
                    buyNowOnly
                      ? "border-amber-500 bg-amber-500 text-white"
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
          activeClass="border-amber-500 bg-amber-500 text-white"
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
