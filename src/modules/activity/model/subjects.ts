/**
 * Building the dedupe key and the label for each kind of event.
 *
 * Pure, and separated from the writer so the collapsing rule can be tested
 * without a database. The key decides what counts as "the same thing again",
 * which is the whole difference between a readable history and a wall — get
 * it too specific and nothing ever collapses, too loose and distinct
 * interests merge into one line.
 */

/**
 * A lot's identity across the two platforms.
 *
 * Lot number rather than VIN: lot numbers are unique per platform and always
 * present, while a VIN is nullable on salvage rows — the same choice the
 * favourites unique index makes, and for the same reason. Lower-cased so a
 * link written in caps and one written in lower case are one car.
 */
export function lotSubjectKey(platform: string, lotNumber: string): string {
  return `${platform.trim().toLowerCase()}:${lotNumber.trim().toLowerCase()}`;
}

/**
 * What a lot is called in the history, frozen at the moment it happened.
 *
 * The price is included because a history without it cannot answer the
 * question an admin actually has — "was he looking at cheap ones?" — and
 * because prices move, so the number is only meaningful next to the moment.
 *
 * **Absent, not zero.** A lot with no bid recorded gets no price fragment at
 * all rather than "$0", which would state an offer nobody made. The same
 * invariant the favourites snapshot and the plan cards follow.
 */
export function lotLabel(title: string, priceUsdCents: number | null | undefined): string {
  const name = title.trim() || "Unknown lot";
  if (priceUsdCents == null || priceUsdCents <= 0) return name;
  const price = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(priceUsdCents / 100);
  return `${name} — ${price}`;
}

/**
 * A search, normalised so that trivially different URLs are one interest.
 *
 * Sorted keys and lower-cased values, because `?make=BMW&model=X5` and
 * `?model=x5&make=bmw` are the same search and two rows for them is noise.
 * Paging and display parameters are dropped outright — page 2 of a search is
 * not a new interest, and recording it as one would make every scroll through
 * results look like fresh intent.
 */
const IGNORED_SEARCH_PARAMS = new Set(["page", "sort", "view", "locale", "key"]);

export function searchSubjectKey(params: Record<string, string | string[] | undefined>): string {
  const parts: string[] = [];
  for (const [key, raw] of Object.entries(params)) {
    if (IGNORED_SEARCH_PARAMS.has(key)) continue;
    const value = Array.isArray(raw) ? raw.join(",") : raw;
    if (!value) continue;
    parts.push(`${key}=${value.trim().toLowerCase()}`);
  }
  return parts.sort().join("&");
}

/**
 * A search in words. Falls back to naming the filters when there is no free
 * text, so a line never reads as an empty search someone apparently ran.
 */
export function searchLabel(params: Record<string, string | string[] | undefined>): string {
  const first = (key: string): string => {
    const raw = params[key];
    const value = Array.isArray(raw) ? raw[0] : raw;
    return (value ?? "").trim();
  };

  const query = first("q");
  const described = ["make", "model", "yearFrom", "yearTo", "priceMax"]
    .map((key) => first(key))
    .filter(Boolean)
    .join(" ");

  if (query && described) return `“${query}” · ${described}`;
  if (query) return `“${query}”`;
  if (described) return described;
  return "All vehicles";
}
