"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { clsx } from "clsx";
import { Minus, Plus, WhatsappLogo, Info } from "@phosphor-icons/react/dist/ssr";
import { Link } from "@/i18n/navigation";
import ScrollableSelect from "./ScrollableSelect";
import {
  estimateLandedCost,
  PORT_MULTIPLIER,
  PORT_CUSTOMS,
  SERVICE_FEE_HAZMAT_USD,
  SERVICE_FEE_OVERSIZE_USD,
  type AuctionNetwork,
  type CoreVehicleKind,
} from "@/lib/costEstimate";

// Only the three destinations with a real customs model are offered here.
// The point of a per-lot calculator is an instant number, and the quote-only
// ports (see QUOTE_ONLY_DESTINATION_PORTS) can't produce one - the full
// calculator on /shipping is where those belong, hence the link below it.
const PORT_OPTIONS = Object.keys(PORT_MULTIPLIER);
const PORT_DISPLAY_NAMES: Record<string, Partial<Record<string, string>>> = {
  "Klaipėda, Lithuania": { lt: "Klaipėdos, Lithuania" },
};
const WHATSAPP_NUMBER = "19125612347";
const FALLBACK_BID_STEP_USD = 100;

function formatUsd(v: number) {
  return `$${Math.round(v).toLocaleString()}`;
}
function formatEur(v: number) {
  return `€${Math.round(v).toLocaleString()}`;
}

function Row({
  label,
  value,
  muted = false,
}: {
  label: string;
  value: string;
  muted?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-2 text-sm">
      <span className={muted ? "text-char-400" : "text-char-600"}>{label}</span>
      <span
        className={clsx(
          "shrink-0 font-medium tabular-nums",
          muted ? "text-char-400" : "text-char-900"
        )}
      >
        {value}
      </span>
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  label,
  price,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  price: string;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-char-200 bg-white px-3.5 py-3 transition-colors hover:border-char-300">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={clsx(
          "relative h-5 w-9 shrink-0 rounded-full transition-colors",
          checked ? "bg-amber-500" : "bg-char-200"
        )}
      >
        <span
          className={clsx(
            "absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform",
            checked ? "translate-x-4.5" : "translate-x-0.5"
          )}
        />
      </button>
      <span className="text-sm leading-snug text-char-700">{label}</span>
      <span className="ml-auto shrink-0 text-sm font-semibold text-char-900">{price}</span>
    </label>
  );
}

export default function VehicleCostPanel({
  currentBidUsd,
  buyNowUsd,
  pickupLocation,
  auctionNetwork,
  vehicleKind,
  detectedUsaMade,
  countryOfOrigin,
  bidIncrementUsd,
  lotTitle,
  vin,
  lotNumber,
}: {
  currentBidUsd: number | null;
  buyNowUsd: number | null;
  pickupLocation: string;
  auctionNetwork: AuctionNetwork;
  vehicleKind: CoreVehicleKind;
  /** null when the source didn't say where the car was built. */
  detectedUsaMade: boolean | null;
  /** The country the lot data names, shown when the choice is locked. */
  countryOfOrigin: string | null;
  bidIncrementUsd: number | null;
  lotTitle: string;
  vin: string;
  lotNumber: string;
}) {
  const t = useTranslations("VehicleDetail.calculator");
  const locale = useLocale();

  const startingBid = buyNowUsd ?? currentBidUsd ?? 0;
  const step = bidIncrementUsd && bidIncrementUsd > 0 ? bidIncrementUsd : FALLBACK_BID_STEP_USD;

  const [bid, setBid] = useState(String(startingBid));
  const [port, setPort] = useState(PORT_OPTIONS[0]);
  const [hazmat, setHazmat] = useState(false);
  const [oversize, setOversize] = useState(false);
  // Defaults to the detected value; when nothing was detected it starts off,
  // which includes the duty rather than assuming a waiver that may not apply.
  const [usaMade, setUsaMade] = useState(detectedUsaMade ?? false);
  // When the lot data states a country of manufacture, that's a fact about the
  // car and not a preference - letting someone tick "made in the USA" on a
  // car the source says was built in Japan would produce a duty waiver they'd
  // never actually get at customs. Only editable when the source is silent,
  // which in practice means Copart lots (they send no country at all).
  const originKnown = detectedUsaMade !== null;
  const effectiveUsaMade = originKnown ? detectedUsaMade : usaMade;

  const bidNumber = Math.max(0, Number(bid) || 0);
  const estimate = estimateLandedCost({
    vehicleKind,
    lotPriceUsd: bidNumber,
    pickupLocation,
    auctionNetwork,
    destinationPort: port,
    usaMade: effectiveUsaMade,
    hazmat,
    oversize,
  });

  const customs = PORT_CUSTOMS[port];
  const portLabel = PORT_DISPLAY_NAMES[port]?.[locale] ?? port;
  // Deliberately the raw key's city, not the localised override: the override
  // is the Lithuanian genitive ("Klaipėdos"), which only reads correctly after
  // the preposition the site calculator uses. The row labels here interpolate
  // the city as a bare label, so they need the nominative ("Klaipėda").
  const portCity = port.split(",")[0];
  const dutyWaived = customs?.dutyWaivedForUsaMade && effectiveUsaMade;

  const whatsappHref = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(
    t("whatsappMessage", {
      title: lotTitle,
      lot: lotNumber,
      vin,
      bid: formatUsd(bidNumber),
      port: portLabel,
    })
  )}`;

  return (
    <div className="rounded-2xl border border-char-200 bg-white p-5">
      <h2 className="text-sm font-bold uppercase tracking-wider text-char-400">{t("title")}</h2>

      <label className="mt-4 block text-xs font-semibold uppercase tracking-wider text-char-500">
        {t("yourBid")}
      </label>
      <div className="mt-2 flex items-center rounded-xl border border-char-200 bg-char-50 focus-within:border-amber-400 focus-within:bg-white focus-within:ring-2 focus-within:ring-amber-100">
        <button
          type="button"
          onClick={() => setBid(String(Math.max(0, bidNumber - step)))}
          aria-label={t("decreaseBid")}
          className="px-3.5 py-3 text-char-500 transition-colors hover:text-char-900"
        >
          <Minus size={16} weight="bold" />
        </button>
        <input
          type="number"
          inputMode="numeric"
          min={0}
          step={step}
          value={bid}
          onChange={(e) => setBid(e.target.value)}
          className="w-full [appearance:textfield] bg-transparent py-3 text-center text-lg font-bold tabular-nums text-char-900 outline-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
        <button
          type="button"
          onClick={() => setBid(String(bidNumber + step))}
          aria-label={t("increaseBid")}
          className="px-3.5 py-3 text-char-500 transition-colors hover:text-char-900"
        >
          <Plus size={16} weight="bold" />
        </button>
      </div>
      <p className="mt-1.5 text-xs text-char-400">
        {bidIncrementUsd ? t("bidStepKnown", { step: formatUsd(step) }) : t("bidStepHint")}
      </p>

      <label className="mt-4 block text-xs font-semibold uppercase tracking-wider text-char-500">
        {t("terminal")}
      </label>
      <div className="mt-2">
        <ScrollableSelect
          value={port}
          onChange={(v) => setPort(v || PORT_OPTIONS[0])}
          options={PORT_OPTIONS}
          placeholder={t("terminalPlaceholder")}
          searchPlaceholder={t("searchPlaceholder")}
          getLabel={(opt) => PORT_DISPLAY_NAMES[opt]?.[locale] ?? opt}
        />
      </div>

      <p className="mt-5 text-xs font-semibold uppercase tracking-wider text-char-500">
        {t("extras")}
      </p>
      <div className="mt-2 space-y-2">
        <Toggle
          checked={hazmat}
          onChange={setHazmat}
          label={t("hazmat")}
          price={formatUsd(SERVICE_FEE_HAZMAT_USD)}
        />
        <Toggle
          checked={oversize}
          onChange={setOversize}
          label={t("oversize")}
          price={formatUsd(SERVICE_FEE_OVERSIZE_USD)}
        />
      </div>

      {/* Paid in the USA */}
      <div className="mt-5 rounded-xl bg-char-50 p-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-char-500">
          {t("usSide.title")}
        </p>
        <div className="mt-1 divide-y divide-char-200/70">
          <Row label={t("usSide.lotPrice")} value={formatUsd(estimate.usSide.lotPriceUsd)} />
          <Row label={t("usSide.auctionFees")} value={formatUsd(estimate.usSide.auctionFeesUsd)} />
          <Row label={t("usSide.titleFee")} value={formatUsd(estimate.usSide.titleFeeUsd)} />
          <Row label={t("usSide.brokerFee")} value={formatUsd(estimate.usSide.brokerageFeeUsd)} />
          <Row label={t("usSide.trucking")} value={formatUsd(estimate.usSide.truckingUsd)} />
          <Row
            label={t("usSide.oceanFreight", { port: portCity })}
            value={formatUsd(estimate.usSide.oceanFreightUsd)}
          />
          {estimate.usSide.optionalServicesUsd > 0 && (
            <Row
              label={t("usSide.extras")}
              value={formatUsd(estimate.usSide.optionalServicesUsd)}
            />
          )}
        </div>
        <div className="mt-2 flex items-center justify-between border-t border-char-300 pt-3 text-base font-bold text-char-900">
          <span>{t("usSide.subtotal")}</span>
          <span className="tabular-nums">{formatUsd(estimate.usSide.subtotalUsd)}</span>
        </div>
      </div>

      {/* Due at the destination port */}
      <div className="mt-3 rounded-xl bg-char-50 p-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-char-500">
          {t("destinationSide.title", { port: portCity })}
        </p>
        <div className="mt-1 divide-y divide-char-200/70">
          <Row
            label={t("destinationSide.vat", {
              rate: customs ? Math.round(customs.vat * 100) : 0,
            })}
            value={formatUsd(estimate.destinationSide.vatUsd)}
          />
          <Row
            label={
              dutyWaived
                ? t("destinationSide.dutyWaived")
                : t("destinationSide.duty", { rate: customs ? Math.round(customs.duty * 100) : 0 })
            }
            value={formatUsd(estimate.destinationSide.dutyUsd)}
            muted={dutyWaived}
          />
          <Row
            label={t("destinationSide.clearance")}
            value={formatUsd(estimate.destinationSide.clearanceUsd)}
          />
        </div>
        <div className="mt-2 flex items-center justify-between border-t border-char-300 pt-3 text-base font-bold text-char-900">
          <span>{t("destinationSide.subtotal")}</span>
          <span className="tabular-nums">{formatUsd(estimate.destinationSide.subtotalUsd)}</span>
        </div>
      </div>

      <label
        className={clsx(
          "mt-4 flex items-start gap-2.5 text-sm",
          originKnown ? "cursor-default text-char-500" : "cursor-pointer text-char-600"
        )}
      >
        <input
          type="checkbox"
          checked={effectiveUsaMade}
          disabled={originKnown}
          onChange={(e) => setUsaMade(e.target.checked)}
          className="mt-0.5 h-4 w-4 rounded accent-amber-500 disabled:cursor-not-allowed"
        />
        <span>
          {t("usaMade")}
          {originKnown && (
            <span className="ml-1 block text-xs text-char-400 sm:ml-1.5 sm:inline">
              {countryOfOrigin
                ? t("usaMadeFromData", { country: countryOfOrigin })
                : t("usaMadeDetected")}
            </span>
          )}
        </span>
      </label>

      {port === "Poti, Georgia" && (
        <p className="mt-3 text-xs leading-relaxed text-amber-700">{t("georgiaNote")}</p>
      )}

      <div className="mt-5 rounded-xl bg-char-900 p-4 text-white">
        <p className="text-xs font-semibold uppercase tracking-wider text-white/60">
          {t("grandTotal")}
        </p>
        <p className="mt-1 text-3xl font-extrabold tabular-nums">
          {formatUsd(estimate.totalUsd)}
        </p>
        <p className="mt-0.5 text-sm text-white/70">≈ {formatEur(estimate.totalEur)}</p>
      </div>

      <div className="mt-4 flex flex-col gap-2">
        <a
          href={whatsappHref}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center gap-2 rounded-full bg-amber-500 px-6 py-3.5 text-sm font-semibold text-white shadow-sm shadow-amber-900/20 transition-colors hover:bg-amber-600"
        >
          <WhatsappLogo size={17} weight="fill" />
          {t("ctaWhatsapp")}
        </a>
        <Link
          href="/contact"
          className="inline-flex items-center justify-center gap-2 rounded-full border border-char-200 bg-white px-6 py-3.5 text-sm font-semibold text-char-800 transition-colors hover:border-amber-400 hover:text-amber-700"
        >
          {t("ctaContact")}
        </Link>
      </div>

      <p className="mt-4 flex items-start gap-2 text-xs leading-relaxed text-char-400">
        <Info size={14} className="mt-0.5 shrink-0" />
        <span>
          {t("disclaimer")}{" "}
          <Link href="/shipping" className="underline hover:text-char-600">
            {t("otherPorts")}
          </Link>
        </span>
      </p>
    </div>
  );
}
