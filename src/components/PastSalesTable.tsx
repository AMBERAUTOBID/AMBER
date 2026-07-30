import { CaretDown } from "@phosphor-icons/react/dist/ssr";
import type { VehicleListItem } from "@/lib/apibara";
import { formatUsd } from "@/modules/pricing/model/format";

/**
 * The actual comparable lots behind the min/avg/max strip. Only rows with a
 * real recorded sale price are listed - a comparable with no price tells the
 * reader nothing and would pad the table with blanks.
 */
export default function PastSalesTable({
  past,
  labels,
}: {
  past: VehicleListItem[];
  labels: {
    title: string;
    count: string;
    vehicle: string;
    sold: string;
    odometer: string;
    damage: string;
    price: string;
  };
}) {
  const sold = past
    .filter((v) => typeof v.pricing?.last_sold_price_usd === "number" && v.pricing.last_sold_price_usd > 0)
    .sort((a, b) => (b.auction?.last_sold_day ?? "").localeCompare(a.auction?.last_sold_day ?? ""));

  if (sold.length === 0) return null;

  return (
    <details className="group rounded-2xl border border-char-200 bg-white">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-5">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-wider text-char-400">
            {labels.title}
          </h2>
          <p className="mt-0.5 text-sm text-char-600">{labels.count}</p>
        </div>
        <CaretDown
          size={18}
          weight="bold"
          className="shrink-0 text-char-400 transition-transform group-open:rotate-180"
        />
      </summary>

      <div className="overflow-x-auto border-t border-char-100">
        <table className="w-full min-w-[34rem] text-left text-sm">
          <thead>
            <tr className="text-xs font-semibold uppercase tracking-wider text-char-400">
              <th className="px-5 py-3 font-semibold">{labels.vehicle}</th>
              <th className="px-3 py-3 font-semibold">{labels.sold}</th>
              <th className="px-3 py-3 font-semibold">{labels.odometer}</th>
              <th className="px-3 py-3 font-semibold">{labels.damage}</th>
              <th className="px-5 py-3 text-right font-semibold">{labels.price}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-char-100">
            {sold.map((v) => (
              <tr key={`${v.platform}-${v.vin}`}>
                <td className="px-5 py-3 font-medium text-char-900">{v.title}</td>
                <td className="whitespace-nowrap px-3 py-3 text-char-500">
                  {v.auction?.last_sold_day ?? "—"}
                </td>
                <td className="whitespace-nowrap px-3 py-3 text-char-500">
                  {typeof v.odometer?.mi === "number"
                    ? `${v.odometer.mi.toLocaleString()} mi`
                    : "—"}
                </td>
                <td className="px-3 py-3 text-char-500">{v.condition?.primary_damage ?? "—"}</td>
                <td className="whitespace-nowrap px-5 py-3 text-right font-bold tabular-nums text-char-900">
                  {formatUsd(v.pricing!.last_sold_price_usd!)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
