import { Link } from "@/i18n/navigation";
import { CAR_MAKES, getMakeMonogram } from "@/lib/carMakes";

export default function CarMakesGrid() {
  return (
    <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
      {CAR_MAKES.map((make) => (
        <Link
          key={make}
          href={{ pathname: "/search", query: { make } }}
          className="group flex h-24 flex-col items-center justify-center gap-2 rounded-xl border border-char-200 bg-white px-2 text-center transition-colors hover:border-amber-400 hover:bg-amber-50"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-char-100 text-xs font-extrabold tracking-tight text-char-600 transition-colors group-hover:bg-amber-500 group-hover:text-white">
            {getMakeMonogram(make)}
          </span>
          <span className="text-xs font-semibold text-char-700 transition-colors group-hover:text-amber-700 sm:text-sm">
            {make}
          </span>
        </Link>
      ))}
    </div>
  );
}
