import { MapPin, Gauge } from "@phosphor-icons/react/dist/ssr";
import { Link } from "@/i18n/navigation";
import type { VehicleListItem } from "@/modules/inventory/api";

/** Lots that haven't been bid on yet come back as 0, not null - printing
 * "$0" would read as a price rather than as "no bids yet". */
function formatPrice(value: number | null | undefined) {
  if (typeof value !== "number" || value <= 0) return null;
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

/**
 * Compact result card for a lot. Labels arrive as props rather than being
 * looked up here so the card stays a plain synchronous server component and
 * can be rendered inside a `.map()` without each instance awaiting its own
 * translations.
 */
export default function LotCard({
  vehicle,
  labels,
}: {
  vehicle: VehicleListItem;
  labels: { noPhoto: string; priceNA: string; damagePrefix: string };
}) {
  const photo = vehicle.media?.thumbs?.[0];
  const priceLabel =
    formatPrice(vehicle.pricing?.current_bid_usd) ??
    formatPrice(vehicle.pricing?.buy_now_usd) ??
    labels.priceNA;

  return (
    <Link
      href={`/vehicle/${vehicle.vin}`}
      className="group overflow-hidden rounded-2xl border border-char-200 bg-white transition-all hover:-translate-y-1 hover:border-amber-300 hover:shadow-xl hover:shadow-amber-900/5"
    >
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-char-100">
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photo}
            alt={vehicle.title}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-char-400">
            {labels.noPhoto}
          </div>
        )}
        <span className="absolute left-2.5 top-2.5 rounded-full bg-char-900/80 px-2.5 py-1 text-xs font-semibold uppercase tracking-wider text-white backdrop-blur-sm">
          {vehicle.platform}
        </span>
      </div>
      <div className="p-4">
        <h3 className="line-clamp-1 font-bold text-char-900">{vehicle.title}</h3>
        <p className="mt-1 text-lg font-bold text-amber-600">{priceLabel}</p>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-char-500">
          {vehicle.location?.display && (
            <span className="inline-flex items-center gap-1">
              <MapPin size={13} /> {vehicle.location.display}
            </span>
          )}
          {/* 0 is how an unreported reading arrives, not a real mileage. */}
          {typeof vehicle.odometer?.mi === "number" && vehicle.odometer.mi > 0 && (
            <span className="inline-flex items-center gap-1">
              <Gauge size={13} /> {vehicle.odometer.mi.toLocaleString()} mi
            </span>
          )}
        </div>
        {vehicle.condition?.primary_damage && (
          <p className="mt-2 text-xs font-medium text-char-500">
            {labels.damagePrefix} {vehicle.condition.primary_damage}
          </p>
        )}
      </div>
    </Link>
  );
}
