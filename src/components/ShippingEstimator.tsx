"use client";

import { useMemo, useState } from "react";
import { Car, Truck as TruckIcon, Van } from "@phosphor-icons/react/dist/ssr";
import Button from "./Button";

type VehicleType = "sedan" | "suv" | "truck" | "van";

const BASE_RATES: Record<VehicleType, number> = {
  sedan: 950,
  suv: 1250,
  truck: 1550,
  van: 1700,
};

const PORT_MULTIPLIERS: { key: string; label: string; multiplier: number }[] = [
  { key: "bremerhaven", label: "Bremerhaven, Germany", multiplier: 1 },
  { key: "klaipeda", label: "Klaipėda, Lithuania", multiplier: 1.08 },
  { key: "poti", label: "Poti, Georgia", multiplier: 1.35 },
  { key: "gdansk", label: "Gdańsk, Poland", multiplier: 1.02 },
];

const VEHICLE_ICONS: Record<VehicleType, typeof Car> = {
  sedan: Car,
  suv: Car,
  truck: TruckIcon,
  van: Van,
};

export default function ShippingEstimator({
  labels,
}: {
  labels: {
    title: string;
    subtitle: string;
    vehicleLabel: string;
    vehicleTypes: Record<VehicleType, string>;
    portLabel: string;
    resultLabel: string;
    disclaimer: string;
    cta: string;
  };
}) {
  const [vehicle, setVehicle] = useState<VehicleType>("sedan");
  const [port, setPort] = useState(PORT_MULTIPLIERS[0].key);

  const estimate = useMemo(() => {
    const base = BASE_RATES[vehicle];
    const mult = PORT_MULTIPLIERS.find((p) => p.key === port)?.multiplier ?? 1;
    const low = Math.round((base * mult) / 50) * 50;
    const high = Math.round((base * mult * 1.22) / 50) * 50;
    return { low, high };
  }, [vehicle, port]);

  return (
    <div className="rounded-3xl border border-char-200 bg-white p-8 sm:p-10">
      <h3 className="text-2xl font-extrabold text-char-900">{labels.title}</h3>
      <p className="mt-2 max-w-lg text-sm text-char-600">{labels.subtitle}</p>

      <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-2">
        <div>
          <label className="text-xs font-semibold uppercase tracking-wider text-char-500">
            {labels.vehicleLabel}
          </label>
          <div className="mt-3 grid grid-cols-2 gap-3">
            {(Object.keys(BASE_RATES) as VehicleType[]).map((key) => {
              const Icon = VEHICLE_ICONS[key];
              const active = vehicle === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setVehicle(key)}
                  className={`flex items-center gap-2.5 rounded-xl border px-4 py-3 text-left text-sm font-medium transition-colors ${
                    active
                      ? "border-amber-400 bg-amber-50 text-amber-700"
                      : "border-char-200 text-char-600 hover:border-char-300"
                  }`}
                >
                  <Icon size={18} weight={active ? "fill" : "regular"} />
                  {labels.vehicleTypes[key]}
                </button>
              );
            })}
          </div>

          <label className="mt-6 block text-xs font-semibold uppercase tracking-wider text-char-500">
            {labels.portLabel}
          </label>
          <select
            value={port}
            onChange={(e) => setPort(e.target.value)}
            className="mt-3 w-full rounded-xl border border-char-200 bg-char-50 px-4 py-3 text-sm font-medium text-char-900 outline-none focus:border-amber-400 focus:bg-white focus:ring-2 focus:ring-amber-100"
          >
            {PORT_MULTIPLIERS.map((p) => (
              <option key={p.key} value={p.key}>
                {p.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col justify-between rounded-2xl bg-char-900 p-7">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-char-400">
              {labels.resultLabel}
            </p>
            <p className="mt-3 font-[family-name:var(--font-heading)] text-4xl font-extrabold tabular-nums text-white">
              ${estimate.low.toLocaleString()}–${estimate.high.toLocaleString()}
            </p>
            <p className="mt-4 text-xs leading-relaxed text-char-400">
              {labels.disclaimer}
            </p>
          </div>
          <Button href="/contact" variant="ghost-light" className="mt-6 w-fit">
            {labels.cta}
          </Button>
        </div>
      </div>
    </div>
  );
}
