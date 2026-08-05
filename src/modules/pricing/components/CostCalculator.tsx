"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useLocale, useTranslations } from "next-intl";
import {
  Car,
  Motorcycle,
  Jeep,
  Phone,
  Package,
  CaretDown,
  DotsThree,
  SteeringWheel,
  Waves,
  TruckTrailer,
  Snowflake,
  Boat as BoatIcon,
  Tractor,
} from "@phosphor-icons/react/dist/ssr";
import { clsx } from "clsx";
import { PICKUP_LOCATIONS } from "@/modules/pricing/model/pickupLocations";
import { localTransportRateUsd } from "@/modules/pricing/model/localTransportRates";
import { QUOTE_ONLY_DESTINATION_PORTS } from "@/modules/pricing/model/mapGeo";
import {
  PORT_MULTIPLIER,
  TRUCKING_FLAT_USD,
  BROKERAGE_FEE_USD,
  USD_TO_EUR,
  CORE_VEHICLE_BASE_SHIPPING,
  auctionFeesUsd,
  customsBreakdown,
  isUsaBuiltVin,
  type CoreVehicleKind,
} from "@/modules/pricing/model/costEstimate";
import { formatUsd, formatEur } from "@/modules/pricing/model/format";
import { portLabel } from "@/modules/pricing/model/ports";
import { Link } from "@/i18n/navigation";
import { SITE, CONTACT_HREF } from "@/shared/config/site";
import ScrollableSelect from "@/shared/ui/ScrollableSelect";
import Container from "@/shared/ui/Container";
import Reveal from "@/shared/ui/Reveal";
import RouteGlobe from "./RouteGlobe";

/** The three kinds the shared cost model prices. Aliased rather than
 * redeclared so this widget can never drift out of sync with the model the
 * Telegram bot also uses. */
type PrimaryVehicleKind = CoreVehicleKind;
type MoreVehicleKind =
  | "atv"
  | "trike"
  | "bigMotorcycle"
  | "jetSki"
  | "jetSkiTrailer"
  | "snowmobile"
  | "snowmobileTrailer"
  | "boat"
  | "heavyEquipment";
type VehicleKind = PrimaryVehicleKind | MoreVehicleKind;
type Auction = "copart" | "iaai";

const PRIMARY_VEHICLE_KINDS: PrimaryVehicleKind[] = ["car", "suv", "motorcycle"];
const MORE_VEHICLE_KINDS: MoreVehicleKind[] = [
  "atv",
  "trike",
  "bigMotorcycle",
  "jetSki",
  "jetSkiTrailer",
  "snowmobile",
  "snowmobileTrailer",
  "boat",
  "heavyEquipment",
];
// These categories vary too widely in price/complexity for a formula-based
// number, so the calculator withholds the estimate until a lead email is given.
const EMAIL_REQUIRED_KINDS: VehicleKind[] = ["boat", "heavyEquipment"];

const VEHICLE_ICONS: Record<VehicleKind, typeof Car> = {
  car: Car,
  suv: Jeep,
  motorcycle: Motorcycle,
  atv: SteeringWheel,
  trike: Motorcycle,
  bigMotorcycle: Motorcycle,
  jetSki: Waves,
  jetSkiTrailer: TruckTrailer,
  snowmobile: Snowflake,
  snowmobileTrailer: TruckTrailer,
  boat: BoatIcon,
  heavyEquipment: Tractor,
};

// Illustrative shipping base rates (USD) and destination-port multipliers —
// same estimate model used site-wide, not a live freight-rate feed. Rates for
// the "More" categories are rough placeholders pending real freight numbers.
//
// car/suv/motorcycle are spread in from the shared model rather than repeated
// here: this table used to restate all three, so a rate change in the model
// silently left this widget quoting the old number.
const VEHICLE_BASE_SHIPPING: Record<VehicleKind, number> = {
  ...CORE_VEHICLE_BASE_SHIPPING,
  atv: 350,
  trike: 550,
  bigMotorcycle: 650,
  jetSki: 400,
  jetSkiTrailer: 500,
  snowmobile: 400,
  snowmobileTrailer: 500,
  boat: 1800,
  heavyEquipment: 2500,
};
// Destinations with a real customs/duty model (priced) plus destinations
// that only offer a "request a quote by email" flow (no customs data yet).
const PORT_OPTIONS = [...Object.keys(PORT_MULTIPLIER), ...QUOTE_ONLY_DESTINATION_PORTS];

type Result = {
  lotPrice: number;
  auctionFees: number;
  brokerageFee: number;
  trucking: number;
  shipping: number;
  duty: number;
  vat: number;
  isGeorgia: boolean;
  totalEur: number;
};

export default function CostCalculator() {
  const t = useTranslations("Calculator");
  const locale = useLocale();

  const [vehicleKind, setVehicleKind] = useState<VehicleKind>("car");
  const [moreOpen, setMoreOpen] = useState(false);
  const [auction, setAuction] = useState<Auction>("copart");
  const [price, setPrice] = useState("");
  const [pickup, setPickup] = useState("");
  const [port, setPort] = useState(PORT_OPTIONS[0]);
  const [email, setEmail] = useState("");
  const [vin, setVin] = useState("");
  const [usaMade, setUsaMade] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [quoteRequested, setQuoteRequested] = useState(false);

  const selectedMoreKind = MORE_VEHICLE_KINDS.includes(vehicleKind as MoreVehicleKind)
    ? (vehicleKind as MoreVehicleKind)
    : null;
  // A VIN states where the car was actually assembled, so once one is entered
  // it decides the duty and the checkbox stops being editable — same rule as
  // the per-lot panel. Ticking "made in USA" on a car the VIN says was built
  // in Japan would quote a waiver customs would never grant.
  const detectedUsaMade = isUsaBuiltVin(vin);
  const originKnown = detectedUsaMade !== null;
  const effectiveUsaMade = originKnown ? detectedUsaMade : usaMade;

  const isQuoteOnlyPort = QUOTE_ONLY_DESTINATION_PORTS.includes(port);
  const emailRequired = EMAIL_REQUIRED_KINDS.includes(vehicleKind) || isQuoteOnlyPort;
  const canCalculate = !emailRequired || email.trim().length > 0;

  function selectVehicleKind(kind: VehicleKind) {
    setVehicleKind(kind);
    setMoreOpen(false);
  }

  function handleCalculate() {
    if (!canCalculate) return;

    if (isQuoteOnlyPort) {
      setResult(null);
      setSubmitting(true);
      fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Price calculator quote request",
          email: email.trim(),
          vehicle: `${vehicleKind} via ${auction}${pickup ? ` from ${pickup}` : ""}`,
          message: `Quote request — no instant pricing for destination: ${port}. Lot price: $${
            Number(price) || 0
          }, USA-made: ${effectiveUsaMade}${vin.trim() ? `, VIN: ${vin.trim()}` : ""}.`,
        }),
      })
        .then(() => setQuoteRequested(true))
        .catch(() => {})
        .finally(() => setSubmitting(false));
      return;
    }

    const lotPrice = Number(price) || 0;
    const auctionFees = auctionFeesUsd(lotPrice);
    const brokerageFee = BROKERAGE_FEE_USD;
    // Real per-location rates only cover Car/SUV/Motorcycle; every other
    // vehicle kind (ATV, boat, etc.) keeps the flat placeholder rate.
    const trucking =
      vehicleKind === "car" || vehicleKind === "suv" || vehicleKind === "motorcycle"
        ? localTransportRateUsd(pickup, auction, vehicleKind, TRUCKING_FLAT_USD)
        : TRUCKING_FLAT_USD;
    const shipping = VEHICLE_BASE_SHIPPING[vehicleKind] * (PORT_MULTIPLIER[port] ?? 1);
    const { dutyUsd: duty, vatUsd: vat } = customsBreakdown({
      lotPriceUsd: lotPrice,
      shippingUsd: shipping,
      destinationPort: port,
      usaMade: effectiveUsaMade,
    });
    const totalUsd = lotPrice + auctionFees + brokerageFee + trucking + shipping + duty + vat;

    setResult({
      lotPrice,
      auctionFees,
      brokerageFee,
      trucking,
      shipping,
      duty,
      vat,
      isGeorgia: port === "Poti, Georgia",
      totalEur: totalUsd * USD_TO_EUR,
    });

    if (email.trim()) {
      setSubmitting(true);
      fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Price calculator lead",
          email: email.trim(),
          vehicle: `${vehicleKind} via ${auction}${pickup ? ` from ${pickup}` : ""}`,
          message: `Calculator estimate — price: $${lotPrice}, port: ${port}, USA-made: ${effectiveUsaMade}${
            vin.trim() ? `, VIN: ${vin.trim()}` : ""
          }, total: ~€${Math.round(totalUsd * USD_TO_EUR)}`,
        }),
      })
        .catch(() => {})
        .finally(() => setSubmitting(false));
    }
  }

  const portCity = portLabel(port, locale).split(",")[0];

  return (
    <section className="bg-char-50 py-20 sm:py-24">
      <Container>
        <Reveal className="mx-auto max-w-2xl text-center">
          <span className="inline-flex items-center rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-amber-700">
            {t("eyebrow")}
          </span>
          <h2 className="mt-4 text-3xl font-extrabold tracking-tight text-char-900 sm:text-4xl">
            {t("title")}
          </h2>
          <p className="mt-4 text-base leading-relaxed text-char-600 sm:text-lg">
            {t("subtitle")}
          </p>
        </Reveal>

        <div className="mt-12 grid grid-cols-1 items-center gap-10 lg:grid-cols-2">
        <Reveal className="w-full max-w-xl justify-self-center lg:justify-self-auto">
          <div className="rounded-3xl border border-char-200 bg-white p-6 shadow-xl shadow-char-900/5 sm:p-7">
            <div className="flex flex-wrap items-center gap-1 border-b border-char-100">
              {PRIMARY_VEHICLE_KINDS.map((kind) => {
                const Icon = VEHICLE_ICONS[kind];
                const active = vehicleKind === kind;
                return (
                  <button
                    key={kind}
                    type="button"
                    onClick={() => selectVehicleKind(kind)}
                    className={clsx(
                      "flex items-center gap-1.5 border-b-2 px-3 pb-2.5 text-sm font-semibold transition-colors",
                      active
                        ? "border-amber-500 text-amber-700"
                        : "border-transparent text-char-500 hover:text-char-700"
                    )}
                  >
                    <Icon size={17} weight={active ? "fill" : "regular"} />
                    {t(`vehicleTypes.${kind}`)}
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => setMoreOpen((open) => !open)}
                className={clsx(
                  "flex items-center gap-1.5 border-b-2 px-3 pb-2.5 text-sm font-semibold transition-colors",
                  selectedMoreKind || moreOpen
                    ? "border-amber-500 text-amber-700"
                    : "border-transparent text-char-500 hover:text-char-700"
                )}
              >
                {selectedMoreKind ? (
                  (() => {
                    const Icon = VEHICLE_ICONS[selectedMoreKind];
                    return <Icon size={17} weight="fill" />;
                  })()
                ) : (
                  <DotsThree size={17} weight={moreOpen ? "fill" : "regular"} />
                )}
                {selectedMoreKind ? t(`vehicleTypes.${selectedMoreKind}`) : t("vehicleTypes.more")}
                <CaretDown
                  size={12}
                  className={clsx("transition-transform duration-200", moreOpen && "rotate-180")}
                />
              </button>
            </div>

            <AnimatePresence initial={false}>
              {moreOpen && (
                <motion.div
                  key="more-panel"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                  className="overflow-hidden"
                >
                  <div className="grid grid-cols-3 gap-2 border-b border-char-100 py-3">
                    {MORE_VEHICLE_KINDS.map((kind) => {
                      const Icon = VEHICLE_ICONS[kind];
                      const active = vehicleKind === kind;
                      return (
                        <button
                          key={kind}
                          type="button"
                          onClick={() => selectVehicleKind(kind)}
                          className={clsx(
                            "flex flex-col items-center gap-1 rounded-xl border px-2 py-2.5 text-center text-xs font-medium leading-tight transition-colors",
                            active
                              ? "border-amber-400 bg-amber-50 text-amber-700"
                              : "border-char-200 text-char-600 hover:border-char-300 hover:bg-char-50"
                          )}
                        >
                          <Icon size={18} weight={active ? "fill" : "regular"} />
                          {t(`vehicleTypes.${kind}`)}
                        </button>
                      );
                    })}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="mt-4 flex flex-wrap gap-4">
              {(["copart", "iaai"] as Auction[]).map((a) => (
                <label
                  key={a}
                  className="flex cursor-pointer items-center gap-2 text-sm font-medium text-char-700"
                >
                  <input
                    type="radio"
                    name="auction"
                    checked={auction === a}
                    onChange={() => setAuction(a)}
                    className="h-4 w-4 accent-amber-500"
                  />
                  {t(`auction${a === "copart" ? "Copart" : "Iaai"}`)}
                </label>
              ))}
            </div>

            <input
              type="number"
              inputMode="numeric"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder={t("priceLabel")}
              className="mt-4 w-full rounded-xl border border-char-200 bg-char-50 px-4 py-3 text-sm outline-none focus:border-amber-400 focus:bg-white focus:ring-2 focus:ring-amber-100"
            />

            <div className="mt-3">
              <ScrollableSelect
                value={pickup}
                onChange={setPickup}
                options={PICKUP_LOCATIONS}
                placeholder={t("pickupPlaceholder")}
                searchPlaceholder={t("searchPlaceholder")}
              />
            </div>

            <div className="mt-3">
              <ScrollableSelect
                value={port}
                onChange={(v) => {
                  setPort(v || PORT_OPTIONS[0]);
                  setResult(null);
                  setQuoteRequested(false);
                }}
                options={PORT_OPTIONS}
                placeholder={t("portPlaceholder")}
                searchPlaceholder={t("searchPlaceholder")}
              />
            </div>

            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t("emailPlaceholder")}
              className="mt-3 w-full rounded-xl border border-char-200 bg-char-50 px-4 py-3 text-sm outline-none focus:border-amber-400 focus:bg-white focus:ring-2 focus:ring-amber-100"
            />

            <input
              type="text"
              value={vin}
              onChange={(e) => setVin(e.target.value)}
              placeholder={t("vinPlaceholder")}
              maxLength={17}
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              className="mt-3 w-full rounded-xl border border-char-200 bg-char-50 px-4 py-3 font-mono text-sm uppercase tracking-wider outline-none focus:border-amber-400 focus:bg-white focus:ring-2 focus:ring-amber-100"
            />

            <label
              className={clsx(
                "mt-3 flex items-center gap-2 text-sm text-char-600",
                originKnown ? "cursor-default" : "cursor-pointer"
              )}
            >
              <input
                type="checkbox"
                checked={effectiveUsaMade}
                onChange={(e) => setUsaMade(e.target.checked)}
                disabled={originKnown}
                className="h-4 w-4 rounded accent-amber-500 disabled:opacity-60"
              />
              {t("usaMade")}
            </label>
            {originKnown && (
              <p className="mt-1.5 text-xs text-char-500">
                {detectedUsaMade ? t("usaMadeFromVin") : t("notUsaMadeFromVin")}
              </p>
            )}
            {effectiveUsaMade && (
              <p className="mt-1.5 text-xs text-char-500">{t("usaMadeProofNote")}</p>
            )}

            <button
              type="button"
              onClick={handleCalculate}
              disabled={submitting || !canCalculate}
              className="mt-5 w-full rounded-xl bg-char-900 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-char-800 disabled:opacity-60"
            >
              {isQuoteOnlyPort ? t("requestQuoteButton") : t("calculateButton")}
            </button>
            {emailRequired && !canCalculate && (
              <p className="mt-2 text-xs font-medium text-amber-700">
                {isQuoteOnlyPort ? t("portQuoteRequiredNote") : t("emailRequiredNote")}
              </p>
            )}

            {isQuoteOnlyPort ? (
              <div className="mt-5 border-t border-char-100 pt-4 text-sm text-char-600">
                <p>{quoteRequested ? t("results.quoteSent") : t("results.quoteOnlyNote")}</p>
              </div>
            ) : (
            <div className="mt-5 space-y-2 border-t border-char-100 pt-4 text-sm text-char-600">
              <div className="flex items-center justify-between">
                <span>{t("results.lotPrice")}</span>
                <span className="font-medium text-char-900">
                  {result ? formatUsd(result.lotPrice) : "–"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>{t("results.auctionFees")}</span>
                <span className="font-medium text-char-900">
                  {result ? formatUsd(result.auctionFees) : "–"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>{t("results.brokerageFee")}</span>
                <span className="font-medium text-char-900">
                  {result ? formatUsd(result.brokerageFee) : "–"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>{t("results.trucking")}</span>
                <span className="font-medium text-char-900">
                  {result ? formatUsd(result.trucking) : "–"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>{t("results.shipping", { port: portCity })}</span>
                <span className="font-medium text-char-900">
                  {result ? formatUsd(result.shipping) : "–"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>{t("results.duty")}</span>
                <span className="font-medium text-char-900">
                  {result ? formatUsd(result.duty) : "–"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>{t("results.vat")}</span>
                <span className="font-medium text-char-900">
                  {result ? formatUsd(result.vat) : "–"}
                </span>
              </div>
              <div className="flex items-center justify-between border-t border-char-200 pt-3 text-base font-bold text-char-900">
                <span>{t("results.total")}</span>
                <span>{result ? formatEur(result.totalEur) : "0 €"}</span>
              </div>
            </div>
            )}

            {result?.isGeorgia && (
              <p className="mt-3 text-xs leading-relaxed text-amber-700">{t("results.georgiaNote")}</p>
            )}

            <p className="mt-4 text-xs leading-relaxed text-char-400">{t("disclaimer")}</p>
          </div>
        </Reveal>

        <Reveal delay={0.1} className="w-full max-w-xl justify-self-center lg:justify-self-auto">
          <p className="text-sm font-semibold text-char-900">{t("map.title")}</p>
          <p className="mt-1 text-xs leading-relaxed text-char-500">{t("map.subtitle")}</p>

          <RouteGlobe pickup={pickup} destinationPort={port} className="mt-2" />

          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-char-500">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-char-400" />
              {t("map.legendPorts")}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-amber-500" />
              {t("map.legendPickup")}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-0.5 w-4 rounded-full bg-char-900" />
              {t("map.legendTrucking")}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-0.5 w-4 rounded-full bg-amber-500" />
              {t("map.legendOcean")}
            </span>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <a
              href={CONTACT_HREF.tel}
              className="inline-flex items-center gap-2 rounded-full bg-char-900 px-6 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-char-800"
            >
              <Phone size={16} weight="fill" className="text-amber-400" />
              {t("ctaPhone")} {SITE.phone.display}
            </a>
            <Link
              href="/shipping"
              className="inline-flex items-center gap-2 rounded-full border border-char-200 bg-white px-6 py-3.5 text-sm font-semibold text-char-800 transition-colors hover:border-amber-400 hover:text-amber-700"
            >
              <Package size={16} weight="fill" className="text-amber-500" />
              {t("ctaTrack")}
            </Link>
          </div>
        </Reveal>
        </div>
      </Container>
    </section>
  );
}
