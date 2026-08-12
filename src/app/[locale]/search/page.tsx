import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import Container from "@/shared/ui/Container";
import Reveal from "@/shared/ui/Reveal";
import Button from "@/shared/ui/Button";
import SearchWidget from "@/modules/inventory/components/SearchWidget";
import LotCard from "@/modules/inventory/components/LotCard";
import { Link } from "@/i18n/navigation";
import FilterPanel, { countActiveFilters } from "@/modules/inventory/components/FilterPanel";
import FilterDisclosure from "@/modules/inventory/components/FilterDisclosure";
import {
  getAuctionSource,
  type AuctionPlatform,
  type SearchFacets,
  type VehicleSearchResponse,
} from "@/modules/inventory/api";
import { parseFreeTextQuery, CATEGORY_TYPE_GROUPS } from "@/modules/inventory/model/searchQuery";
import { currentUser } from "@/modules/auth/model/currentUser";
import { savedLotKeys, lotKey } from "@/modules/favorites/model/favorites";
import SaveLotButton from "@/modules/favorites/components/SaveLotButton";
import {
  Info,
  ChatCircleDots,
  MagnifyingGlass,
  ArrowLeft,
  ArrowRight,
} from "@phosphor-icons/react/dist/ssr";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Search" });
  return { title: t("hero.title") };
}

function str(v: string | string[] | undefined): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

function num(v: string | string[] | undefined): number | undefined {
  const s = str(v);
  if (!s) return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}


export default async function SearchPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Search");
  const sp = await searchParams;

  const q = str(sp.q) ?? "";
  const make = str(sp.make);
  const model = str(sp.model);
  const type = str(sp.type);
  const category = str(sp.category) as "automobile" | "truck" | "motorcycle" | undefined;
  const platform = str(sp.platform) as AuctionPlatform | undefined;
  const cursor = str(sp.cursor);

  // Structured filters from the category picker take priority; a plain
  // typed query only gets the make/model-guessing treatment when nothing
  // more specific came through.
  let effectiveMake = make;
  let effectiveModel = model;
  let effectiveType = type;
  let s: string | undefined;
  // A year or body style read out of the typed text is only a default — an
  // explicit dropdown value always wins over something we inferred.
  let parsedYearFrom: number | undefined;
  let parsedYearTo: number | undefined;
  if (!make && !model && !type && q) {
    const parsed = parseFreeTextQuery(q);
    effectiveMake = parsed.make;
    effectiveModel = parsed.model;
    effectiveType = parsed.type;
    s = parsed.s;
    parsedYearFrom = parsed.yearFrom;
    parsedYearTo = parsed.yearTo;
  }

  // The facet filters. Their URL names match the search-param names exactly, so
  // there is no translation table between the address bar and the query — one
  // fewer place for a filter to be silently dropped. Each is a comma-separated
  // multi-select; an unrecognised value matches nothing rather than being
  // ignored, which is what makes a mistyped URL honest instead of misleading.
  const FACET_PARAMS = [
    "vehicle_class",
    "fuel",
    "drive",
    "body_type",
    "title",
    "color",
    "transmission",
    "damage",
    "secondary_damage",
    "run_cond",
    "cylinders",
    "seller",
    "keys",
  ] as const;
  const facetFilters: Record<string, string> = {};
  for (const key of FACET_PARAMS) {
    const v = str(sp[key]);
    if (v) facetFilters[key] = v;
  }

  const baseSearchParams = {
    s,
    make: effectiveMake,
    model: effectiveModel,
    type: effectiveType,
    platform,
    year_from: num(sp.yearFrom) ?? parsedYearFrom,
    year_to: num(sp.yearTo) ?? parsedYearTo,
    odometer_from: num(sp.odoMin),
    odometer_to: num(sp.odoMax),
    engine_from: num(sp.engineFrom),
    engine_to: num(sp.engineTo),
    buy_now_min: num(sp.buyNowMin),
    buy_now_max: num(sp.buyNowMax),
    price_min: num(sp.priceMin),
    price_max: num(sp.priceMax),
    retail_min: num(sp.retailMin),
    retail_max: num(sp.retailMax),
    enhanced: sp.enhanced === "1" ? true : undefined,
    lot_status: sp.buyNow === "1" ? ("Buy Now" as const) : undefined,
    ...facetFilters,
    cursor,
    per_page: 20,
  };

  // Automobile/Truck/Motorcycle share real make names (Honda and BMW both
  // make cars and motorcycles; several makes span cars and trucks too), so a
  // `make`-only filter can't distinguish them - this is exactly what caused
  // "Motorcycle > Honda" to surface Civics and Ridgelines. Once a specific
  // model is chosen there's no ambiguity left (no motorcycle is named
  // "Civic"), so the type fan-out is only needed for a broad, model-less
  // browse.
  //
  // Guarded by a lookup rather than by `category` being truthy: `category=more`
  // is reachable by hand-editing the URL and has no entry in
  // CATEGORY_TYPE_GROUPS, which used to hand `undefined` to the fan-out and
  // throw a TypeError that surfaced as "search is unavailable".
  const fanOutTypes =
    !effectiveModel && !effectiveType && category ? CATEGORY_TYPE_GROUPS[category] : undefined;

  let results: VehicleSearchResponse | null = null;
  let facets: SearchFacets | null = null;
  let error: string | null = null;
  try {
    const source = getAuctionSource();
    // Counts run alongside the results rather than after them: they answer a
    // different question and neither waits on the other.
    const [searchResult, facetResult] = await Promise.all([
      fanOutTypes
        ? source.searchVehiclesAcrossTypes(baseSearchParams, fanOutTypes)
        : source.searchVehicles(baseSearchParams),
      // Optional on the interface and absent on Apibara, whose `filters`
      // response is an echo of the request. No facets means no sidebar, and the
      // page behaves exactly as it did before the mirror existed.
      source.getFacets?.(baseSearchParams, fanOutTypes) ?? Promise.resolve(null),
    ]);
    results = searchResult;
    facets = facetResult;
  } catch (e) {
    error = e instanceof Error ? e.message : "Unknown error";
  }

  // Who is looking, and which of these lots they already hold. ONE query for
  // the whole grid — resolving it per card would mean twenty round trips for
  // a twenty-result page. Signed-out visitors cost nothing extra: no session,
  // no lookup.
  const viewer = await currentUser();
  const savedKeys = viewer ? await savedLotKeys(viewer.id) : new Set<string>();

  const basePageQuery: Record<string, string> = {};
  if (q) basePageQuery.q = q;
  if (make) basePageQuery.make = make;
  if (model) basePageQuery.model = model;
  if (type) basePageQuery.type = type;
  if (category) basePageQuery.category = category;
  if (platform) basePageQuery.platform = platform;
  // Every range the widget can set, carried as a list rather than a line each.
  // Written out one by one, this drifted: yearFrom/To and odoMin/Max were here
  // and engine, retail, price and buy-now were not, so setting an engine size
  // and then ticking any facet silently dropped it. The page read those params
  // into the query all along — only the links forgot them.
  const RANGE_PARAMS = [
    "yearFrom",
    "yearTo",
    "odoMin",
    "odoMax",
    "engineFrom",
    "engineTo",
    "retailMin",
    "retailMax",
    "priceMin",
    "priceMax",
    "buyNowMin",
    "buyNowMax",
  ] as const;
  for (const key of RANGE_PARAMS) {
    const value = str(sp[key]);
    if (value) basePageQuery[key] = value;
  }
  if (sp.buyNow === "1") basePageQuery.buyNow = "1";
  if (sp.enhanced === "1") basePageQuery.enhanced = "1";
  // Facet selections belong in every link the page emits — paging, and each
  // option's own toggle. Leaving them out is how a visitor loses their filters
  // by clicking "next".
  for (const [key, value] of Object.entries(facetFilters)) basePageQuery[key] = value;

  return (
    <>
      <section className="bg-gradient-to-b from-amber-50/60 via-background to-background py-16 sm:py-20">
        <Container>
          <Reveal className="max-w-2xl">
            <span className="inline-flex items-center rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-amber-700">
              {t("hero.eyebrow")}
            </span>
            <h1 className="mt-5 text-4xl font-extrabold tracking-tight text-char-900 sm:text-5xl">
              {t("hero.title")}
            </h1>
            <p className="mt-5 text-lg leading-relaxed text-char-600">
              {t("hero.subtitle")}
            </p>
          </Reveal>

          <Reveal delay={0.1} className="mt-8">
            <SearchWidget
              variant="elevated"
              labels={{
                vinPlaceholder: t("widget.vinPlaceholder"),
                copartToggle: t("widget.copartToggle"),
                iaaiToggle: t("widget.iaaiToggle"),
                searchButton: t("widget.searchButton"),
                vehicleTypes: t.raw("widget.vehicleTypes"),
                yearFrom: t("widget.yearFrom"),
                yearTo: t("widget.yearTo"),
                buyNow: t("widget.buyNow"),
                browsePrompt: t("widget.browsePrompt"),
                makePlaceholder: t("widget.makePlaceholder"),
                typePlaceholder: t("widget.typePlaceholder"),
                modelPlaceholder: t("widget.modelPlaceholder"),
                searchFilterPlaceholder: t("widget.searchFilterPlaceholder"),
                odometer: t("widget.odometer"),
                odometerReset: t("widget.odometerReset"),
                engine: t("widget.engine"),
                engineReset: t("widget.engineReset"),
                retail: t("widget.retail"),
                retailReset: t("widget.retailReset"),
                retailNote: t("widget.retailNote"),
              }}
            />
          </Reveal>
        </Container>
      </section>

      <section className="pb-20">
        <Container>
          {/* Two columns only when there is a panel to put in the first one.
              Apibara produces no facets, so on Apibara this is the single
              full-width column the page has always had. */}
          <div className={facets ? "grid gap-6 lg:grid-cols-[16rem_1fr]" : ""}>
            {facets && (
              <div className="lg:sticky lg:top-6 lg:self-start">
                {/* Collapsed below lg, where the panel sits above the results
                    rather than beside them and pushes every car off the
                    screen. The panel itself is unchanged and still a server
                    component — see FilterDisclosure. */}
                <FilterDisclosure
                  label={t("filters.heading")}
                  activeCount={countActiveFilters(basePageQuery)}
                >
                  <FilterPanel
                    facets={facets}
                    query={basePageQuery}
                    labels={{
                      heading: t("filters.heading"),
                      reset: t("filters.reset"),
                      // `.raw` deliberately: the message carries a literal
                      // `{count}` that FilterPanel substitutes per group, and
                      // `t()` would read it as an ICU placeholder, demand a
                      // parameter it cannot be given once for twelve groups, and
                      // render the key itself. Caught in the browser — no unit
                      // test sees next-intl's interpolation.
                      showMore: t.raw("filters.showMore") as string,
                      groups: t.raw("filters.groups") as Record<string, string>,
                      options: t.raw("filters.options") as Record<string, Record<string, string>>,
                    }}
                  />
                </FilterDisclosure>
              </div>
            )}
            <div>
          {error && (
            <Reveal className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
              {t("results.error", { error })}
            </Reveal>
          )}

          {results && results.data.length === 0 && (
            <Reveal className="flex flex-col items-center gap-3 rounded-2xl border border-char-200 bg-char-50 py-16 text-center">
              <MagnifyingGlass size={28} className="text-char-300" />
              <p className="text-char-600">{t("results.empty")}</p>
            </Reveal>
          )}

          {/* The result count the aggregator structurally cannot provide — its
              `meta` carries no total at all. Rendered only when there is one, so
              the Apibara path is unchanged. */}
          {results && typeof results.meta.total === "number" && (
            <p className="mb-4 text-sm text-char-500">
              {t("results.count", { count: results.meta.total.toLocaleString() })}
            </p>
          )}

          {results && results.data.length > 0 && (
            <Reveal className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3">
              {/* Shares LotCard with the vehicle page's similar-lots grid, so
                  the "no bids yet" and "odometer not reported" cases can't be
                  handled correctly in one grid and wrongly in the other. */}
              {results.data.map((v) => (
                <LotCard
                  key={`${v.platform}-${v.vin}`}
                  vehicle={v}
                  labels={{
                    noPhoto: t("results.noPhoto"),
                    priceNA: t("results.priceNA"),
                    damagePrefix: t("results.damagePrefix"),
                  }}
                  saveSlot={
                    <SaveLotButton
                      // VIN when there is one, else the lot number: the
                      // server resolves either, and salvage rows sometimes
                      // arrive without a VIN.
                      lot={v.vin || v.lot_number}
                      initiallySaved={savedKeys.has(lotKey(v.platform, v.lot_number))}
                      signedIn={viewer !== null}
                    />
                  }
                />
              ))}
            </Reveal>
          )}

          {results && (results.meta.prev_cursor || results.meta.next_cursor) && (
            <div className="mt-8 flex justify-center gap-3">
              {results.meta.prev_cursor && (
                <Link
                  href={{ pathname: "/search", query: { ...basePageQuery, cursor: results.meta.prev_cursor } }}
                  className="inline-flex items-center gap-2 rounded-full border border-char-200 bg-white px-6 py-3 text-sm font-semibold text-char-700 hover:border-amber-400"
                >
                  <ArrowLeft size={16} /> {t("results.previous")}
                </Link>
              )}
              {results.meta.next_cursor && (
                <Link
                  href={{ pathname: "/search", query: { ...basePageQuery, cursor: results.meta.next_cursor } }}
                  className="inline-flex items-center gap-2 rounded-full border border-char-200 bg-white px-6 py-3 text-sm font-semibold text-char-700 hover:border-amber-400"
                >
                  {t("results.next")} <ArrowRight size={16} />
                </Link>
              )}
            </div>
          )}

            </div>
          </div>

          <Reveal
            delay={0.15}
            className="mt-10 flex flex-col items-start gap-4 rounded-2xl border border-amber-200 bg-amber-50/60 p-7 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="flex gap-4">
              <ChatCircleDots
                size={26}
                weight="duotone"
                className="mt-0.5 shrink-0 text-amber-600"
              />
              <div>
                <h3 className="font-bold text-char-900">{t("helper.title")}</h3>
                <p className="mt-1 text-sm leading-relaxed text-char-600">
                  {t("helper.desc")}
                </p>
              </div>
            </div>
            <Button href="/contact" variant="secondary" className="shrink-0">
              {t("helper.button")}
            </Button>
          </Reveal>

          <Reveal
            delay={0.2}
            className="mt-6 flex items-start gap-3 rounded-2xl border border-char-200 bg-char-50 p-6 text-sm text-char-600"
          >
            <Info size={20} className="mt-0.5 shrink-0 text-char-400" />
            <p>{t("note")}</p>
          </Reveal>
        </Container>
      </section>
    </>
  );
}
