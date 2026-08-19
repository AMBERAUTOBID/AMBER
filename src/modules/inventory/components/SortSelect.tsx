"use client";

import { useRouter } from "@/i18n/navigation";
import { CaretDown } from "@phosphor-icons/react/dist/ssr";

/**
 * "Sort by", beside the result count.
 *
 * A NATIVE `<select>`, unlike every other picker on the site, and on purpose.
 * `ScrollableSelect` earns its keep where lists are long (1,316 makes) or need
 * type-to-filter; this is five fixed options, and the native control brings the
 * platform's own dropdown, keyboard handling and mobile sheet for free. Styling
 * is limited to the closed state, which is all a native select reliably allows.
 *
 * The value list must match `EXPLICIT_SORTS` in `postgresSource` — the empty
 * value is the default segmented order (soonest sale first). An option the
 * server does not recognise degrades to that default rather than erroring, so
 * the two lists drifting is survivable, just not invisible.
 */
export default function SortSelect({
  query,
  value,
  label,
  options,
}: {
  /** The current URL's query — everything is preserved except the cursor. */
  query: Record<string, string>;
  value: string;
  label: string;
  /** value → visitor-facing text, in display order. */
  options: Array<{ value: string; label: string }>;
}) {
  const router = useRouter();

  function onChange(next: string) {
    const q: Record<string, string> = { ...query };
    // Page 5 of the old order is meaningless in the new one.
    delete q.cursor;
    if (next) q.sort = next;
    else delete q.sort;
    // The reader is looking at the list they are reordering; keep them there.
    router.push({ pathname: "/search", query: q }, { scroll: false });
  }

  return (
    <label className="inline-flex items-center gap-2 text-sm text-char-600">
      <span className="shrink-0 font-medium">{label}</span>
      <span className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="cursor-pointer appearance-none rounded-lg border border-char-200 bg-white py-1.5 pl-3 pr-8 text-sm font-semibold text-char-800 outline-none transition-colors hover:border-amber-400 focus:border-amber-400 focus:ring-2 focus:ring-amber-100"
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <CaretDown
          size={12}
          weight="bold"
          aria-hidden
          className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-char-500"
        />
      </span>
    </label>
  );
}
