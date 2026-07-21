"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Car, Motorcycle, Jeep, Phone } from "@phosphor-icons/react/dist/ssr";
import { clsx } from "clsx";
import { PICKUP_LOCATIONS } from "@/lib/pickupLocations";
import ScrollableSelect from "./ScrollableSelect";
import Container from "./Container";
import Reveal from "./Reveal";

type VehicleKind = "car" | "motorcycle" | "suv";
type Auction = "copart" | "iaai";

const VEHICLE_KINDS: VehicleKind[] = ["car", "motorcycle", "suv"];
const VEHICLE_ICONS: Record<VehicleKind, typeof Car> = {
  car: Car,
  motorcycle: Motorcycle,
  suv: Jeep,
};

// Illustrative shipping base rates (USD) and destination-port multipliers —
// same estimate model used site-wide, not a live freight-rate feed.
const VEHICLE_BASE_SHIPPING: Record<VehicleKind, number> = {
  car: 950,
  suv: 1250,
  motorcycle: 500,
};
const PORT_MULTIPLIER: Record<string, number> = {
  "Klaipėda, Lithuania": 1,
  "Poti, Georgia": 1.35,
  "Rotterdam, Netherlands": 0.95,
};
const PORT_OPTIONS = Object.keys(PORT_MULTIPLIER);
const TRUCKING_FLAT_USD = 450;
const USD_TO_EUR = 0.92;
const PHONE_E164 = "+19125612347";
const PHONE_DISPLAY = "+1 (912) 561-2347";

type Result = {
  lotPrice: number;
  auctionFees: number;
  trucking: number;
  shipping: number;
  customs: number;
  totalEur: number;
};

function formatUsd(v: number) {
  return `$${Math.round(v).toLocaleString()}`;
}
function formatEur(v: number) {
  return `€${Math.round(v).toLocaleString()}`;
}

export default function CostCalculator() {
  const t = useTranslations("Calculator");

  const [vehicleKind, setVehicleKind] = useState<VehicleKind>("car");
  const [auction, setAuction] = useState<Auction>("copart");
  const [price, setPrice] = useState("");
  const [pickup, setPickup] = useState("");
  const [port, setPort] = useState(PORT_OPTIONS[0]);
  const [email, setEmail] = useState("");
  const [usaMade, setUsaMade] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function handleCalculate() {
    const lotPrice = Number(price) || 0;
    const auctionFees = Math.max(200, lotPrice * 0.1);
    const trucking = TRUCKING_FLAT_USD;
    const shipping = VEHICLE_BASE_SHIPPING[vehicleKind] * (PORT_MULTIPLIER[port] ?? 1);
    const dutyRate = usaMade ? 0.075 : 0.1;
    const customs = (lotPrice + shipping) * dutyRate;
    const totalUsd = lotPrice + auctionFees + trucking + shipping + customs;

    setResult({
      lotPrice,
      auctionFees,
      trucking,
      shipping,
      customs,
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
          message: `Calculator estimate — price: $${lotPrice}, port: ${port}, USA-made: ${usaMade}, total: ~€${Math.round(
            totalUsd * USD_TO_EUR
          )}`,
        }),
      })
        .catch(() => {})
        .finally(() => setSubmitting(false));
    }
  }

  const portCity = port.split(",")[0];

  return (
    <section className="bg-char-50 py-20 sm:py-24">
      <Container className="grid grid-cols-1 items-center gap-12 lg:grid-cols-2">
        <Reveal>
          <div className="rounded-3xl border border-char-200 bg-white p-6 shadow-xl shadow-char-900/5 sm:p-7">
            <div className="flex gap-1 border-b border-char-100">
              {VEHICLE_KINDS.map((kind) => {
                const Icon = VEHICLE_ICONS[kind];
                const active = vehicleKind === kind;
                return (
                  <button
                    key={kind}
                    type="button"
                    onClick={() => setVehicleKind(kind)}
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
            </div>

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
                onChange={(v) => setPort(v || PORT_OPTIONS[0])}
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

            <label className="mt-3 flex cursor-pointer items-center gap-2 text-sm text-char-600">
              <input
                type="checkbox"
                checked={usaMade}
                onChange={(e) => setUsaMade(e.target.checked)}
                className="h-4 w-4 rounded accent-amber-500"
              />
              {t("usaMade")}
            </label>

            <button
              type="button"
              onClick={handleCalculate}
              disabled={submitting}
              className="mt-5 w-full rounded-xl bg-char-900 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-char-800 disabled:opacity-60"
            >
              {t("calculateButton")}
            </button>

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
                <span>{t("results.customs")}</span>
                <span className="font-medium text-char-900">
                  {result ? formatUsd(result.customs) : "–"}
                </span>
              </div>
              <div className="flex items-center justify-between border-t border-char-200 pt-3 text-base font-bold text-char-900">
                <span>{t("results.total")}</span>
                <span>{result ? formatEur(result.totalEur) : "0 €"}</span>
              </div>
            </div>

            <p className="mt-4 text-xs leading-relaxed text-char-400">{t("disclaimer")}</p>
          </div>
        </Reveal>

        <Reveal delay={0.1}>
          <span className="inline-flex items-center rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-amber-700">
            {t("eyebrow")}
          </span>
          <h2 className="mt-4 text-3xl font-extrabold tracking-tight text-char-900 sm:text-4xl">
            {t("title")}
          </h2>
          <p className="mt-4 text-base leading-relaxed text-char-600 sm:text-lg">
            {t("subtitle")}
          </p>
          <a
            href={`tel:${PHONE_E164}`}
            className="mt-8 inline-flex items-center gap-2 rounded-full bg-char-900 px-6 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-char-800"
          >
            <Phone size={16} weight="fill" className="text-amber-400" />
            {t("ctaPhone")} {PHONE_DISPLAY}
          </a>
        </Reveal>
      </Container>
    </section>
  );
}
