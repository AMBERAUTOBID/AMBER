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
import {
  VEHICLE_CATEGORIES,
  MAKES_BY_CATEGORY,
  MODELS_BY_CATEGORY,
  YEAR_OPTIONS,
  type VehicleCategory,
} from "@/lib/vehicleData";
import ScrollingPlaceholder from "./ScrollingPlaceholder";
import ScrollableSelect from "./ScrollableSelect";
import OdometerRange, { ODO_MIN, ODO_MAX } from "./OdometerRange";

const CATEGORY_ICONS: Record<VehicleCategory, typeof Car> = {
  automobile: Car,
  motorcycle: Motorcycle,
  truck: Truck,
  more: DotsThreeCircle,
};

/**
 * Copart's real search URL (confirmed via multiple independently
 * reverse-engineered scraper/API projects, not guessed): filters live in a
 * `searchCriteria` JSON object — `YEAR`/`ODM` take Solr-style range strings,
 * `MISC` carries a `#MakeCode:X OR #MakeDesc:X` clause for make, and a
 * separate `featuredChips=["buyItNow"]` param restricts results to listings
 * with an active Buy It Now price. Model and vehicle-type stay as free-text
 * query terms — no verified structured param for those.
 *
 * IAAI has no equivalent public documentation we could find, so it stays on
 * a plain keyword search — its Buy Now / year / odometer filtering is
 * best-effort text matching, not a guaranteed structural filter.
 */
function buildCopartUrl({
  text,
  make,
  yearFrom,
  yearTo,
  odoMin,
  odoMax,
  buyNowOnly,
}: {
  text: string;
  make: string;
  yearFrom: string;
  yearTo: string;
  odoMin: number;
  odoMax: number;
  buyNowOnly: boolean;
}) {
  const filter: Record<string, string[]> = {};

  if (yearFrom || yearTo) {
    filter.YEAR = [`lot_year:[${yearFrom || "1920"} TO ${yearTo || "2027"}]`];
  }
  if (odoMin > ODO_MIN || odoMax < ODO_MAX) {
    filter.ODM = [`odometer_reading_received:[${odoMin} TO ${odoMax}]`];
  }
  if (make) {
    filter.MISC = [`#MakeCode:${make.toUpperCase()} OR #MakeDesc:${make}`];
  }

  const searchCriteria = {
    query: [text.trim() || "*"],
    filter,
    searchName: "",
    watchListOnly: false,
    freeFormSearch: false,
  };

  const params = new URLSearchParams();
  params.set("free", "false");
  params.set("searchCriteria", JSON.stringify(searchCriteria));
  if (buyNowOnly) params.set("featuredChips", JSON.stringify(["buyItNow"]));

  return `https://www.copart.com/lotSearchResults?${params.toString()}`;
}

function buildIaaiUrl(term: string) {
  return `https://www.iaai.com/Search?Keyword=${encodeURIComponent(term)}`;
}

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
  const [buyNowOnly, setBuyNowOnly] = useState(false);
  const [copartOn, setCopartOn] = useState(true);
  const [iaaiOn, setIaaiOn] = useState(true);

  function openAuctions(copartUrl: string, iaaiTerm: string) {
    if (!copartOn && !iaaiOn) return;
    if (copartOn) window.open(copartUrl, "_blank", "noopener,noreferrer");
    if (iaaiOn) window.open(buildIaaiUrl(iaaiTerm), "_blank", "noopener,noreferrer");
  }

  function handleQuickSearch(e: React.FormEvent) {
    e.preventDefault();
    const term = quickQuery.trim();
    if (!term) return;
    openAuctions(buildCopartUrl({
      text: term,
      make: "",
      yearFrom: "",
      yearTo: "",
      odoMin: ODO_MIN,
      odoMax: ODO_MAX,
      buyNowOnly: false,
    }), term);
  }

  function handleCategorySearch() {
    if (!category) return;
    const freeText = [model, category !== "automobile" ? labels.vehicleTypes[category] : ""]
      .filter(Boolean)
      .join(" ");

    const copartUrl = buildCopartUrl({
      text: freeText,
      make,
      yearFrom,
      yearTo,
      odoMin,
      odoMax,
      buyNowOnly,
    });

    const iaaiParts = [make, model];
    if (category !== "automobile") iaaiParts.push(labels.vehicleTypes[category]);
    if (yearFrom && yearTo) iaaiParts.push(`${yearFrom}-${yearTo}`);
    else if (yearFrom) iaaiParts.push(yearFrom);
    else if (yearTo) iaaiParts.push(yearTo);
    if (odoMin > ODO_MIN || odoMax < ODO_MAX) {
      iaaiParts.push(`${odoMin}-${odoMax}mi`);
    }
    if (buyNowOnly) iaaiParts.push("Buy It Now");

    openAuctions(copartUrl, iaaiParts.filter(Boolean).join(" "));
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
  const hasOdometer = category !== null && category !== "more";
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

              {hasOdometer && (
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
