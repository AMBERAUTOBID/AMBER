"use client";

import { useState } from "react";
import { MagnifyingGlass, CheckCircle } from "@phosphor-icons/react/dist/ssr";
import { CAR_MAKES } from "@/lib/carMakes";
import ScrollingPlaceholder from "./ScrollingPlaceholder";
import { clsx } from "clsx";

const AUCTION_URLS = {
  copart: (q: string) =>
    `https://www.copart.com/lotSearchResults/?free=true&query=${encodeURIComponent(q)}`,
  iaai: (q: string) => `https://www.iaai.com/Search?Keyword=${encodeURIComponent(q)}`,
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
  initialMake = "",
  variant = "light",
}: {
  labels: {
    makeLabel: string;
    allMakes: string;
    vinPlaceholder: string;
    orDivider: string;
    copartToggle: string;
    iaaiToggle: string;
    searchButton: string;
  };
  initialMake?: string;
  variant?: "light" | "elevated";
}) {
  const [make, setMake] = useState(initialMake);
  const [query, setQuery] = useState("");
  const [copartOn, setCopartOn] = useState(true);
  const [iaaiOn, setIaaiOn] = useState(true);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const term = query.trim() || make;
    if (!copartOn && !iaaiOn) return;
    if (copartOn) window.open(AUCTION_URLS.copart(term), "_blank", "noopener,noreferrer");
    if (iaaiOn) window.open(AUCTION_URLS.iaai(term), "_blank", "noopener,noreferrer");
  }

  return (
    <form
      onSubmit={handleSubmit}
      className={
        variant === "elevated"
          ? "rounded-3xl bg-white p-5 shadow-2xl shadow-char-900/25 sm:p-6"
          : "rounded-3xl border border-char-200 bg-white p-5 sm:p-6"
      }
    >
      <div className="flex flex-col gap-3 sm:flex-row">
        <select
          value={make}
          onChange={(e) => setMake(e.target.value)}
          className="rounded-xl border border-char-200 bg-char-50 px-4 py-3 text-sm font-medium text-char-800 outline-none focus:border-amber-400 focus:bg-white focus:ring-2 focus:ring-amber-100 sm:w-44"
        >
          <option value="">{labels.allMakes}</option>
          {CAR_MAKES.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>

        <span className="hidden items-center text-xs font-semibold uppercase text-char-400 sm:flex">
          {labels.orDivider}
        </span>

        <div className="relative flex-1">
          <MagnifyingGlass
            size={18}
            className="pointer-events-none absolute left-4 top-1/2 z-10 -translate-y-1/2 text-char-400"
          />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full rounded-xl border border-char-200 bg-char-50 py-3 pl-11 pr-4 text-sm text-char-900 outline-none transition-colors focus:border-amber-400 focus:bg-white focus:ring-2 focus:ring-amber-100"
          />
          <ScrollingPlaceholder
            text={labels.vinPlaceholder}
            active={query.length === 0}
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
      </div>

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
    </form>
  );
}
