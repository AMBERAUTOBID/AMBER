import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import Container from "@/shared/ui/Container";
import Button from "@/shared/ui/Button";
import Reveal from "@/shared/ui/Reveal";
import InventoryGallery from "@/modules/inventory/components/InventoryGallery";
import AuctionDateCard from "@/modules/inventory/components/AuctionDateCard";
import LocalDateTime from "@/shared/time/LocalDateTime";
import VehicleCostPanel from "@/modules/pricing/components/VehicleCostPanel";
import PastSalesTable from "@/modules/inventory/components/PastSalesTable";
import LotCard from "@/modules/inventory/components/LotCard";
import SaveLotButton from "@/modules/favorites/components/SaveLotButton";
import { auctionDisplayName, auctionLotUrl } from "@/modules/inventory/model/auctionLotUrl";
import { isStillUpcoming } from "@/modules/inventory/model/relatedLots";
import { ownSaleInstant } from "@/modules/inventory/model/saleInstant";
import LotCountdown from "@/modules/inventory/components/LotCountdown";
import { currentUser } from "@/modules/auth/model/currentUser";
import { savedLotKeys, lotKey } from "@/modules/favorites/model/favorites";
import { recordVisit } from "@/modules/activity/api/recordVisit";
import { lotLabel, lotSubjectKey } from "@/modules/activity/model/subjects";
import AuctionLinkTracker from "@/modules/activity/components/AuctionLinkTracker";
import {
  getAuctionSource,
  type VehicleDetailResponse,
  computeSoldPriceStats,
  extractIaaiValuation,
  extractLotDeepSpecs,
  extractMediaExtras,
  isUsaManufactured,
} from "@/modules/inventory/api";
import {
  inferCoreVehicleKind,
  isUsaBuiltVin,
  normalizeApibaraLocation,
} from "@/modules/pricing/model/costEstimate";
import { formatUsd as formatMoneyUsd } from "@/modules/pricing/model/format";
import {
  MapPin,
  Info,
  Anchor,
  CheckCircle,
  XCircle,
  Barcode,
  Storefront,
  Archive,
  ArrowSquareOut,
} from "@phosphor-icons/react/dist/ssr";

const DELIVERY_PORTS = ["Klaipėda, Lithuania", "Rotterdam, Netherlands", "Poti, Georgia"];

/** Null-tolerant wrapper over the shared money formatter: a missing value
 * renders as nothing at all rather than as a zero that would read as a real
 * price. */
function formatUsd(value: number | null | undefined) {
  if (typeof value !== "number") return null;
  return formatMoneyUsd(value);
}

/** Lots with no bids yet come back as 0 rather than null - "$0" would read as
 * a real price instead of "bidding hasn't opened". */
function formatPrice(value: number | null | undefined) {
  if (typeof value !== "number" || value <= 0) return null;
  return formatUsd(value);
}

function Spec({
  label,
  value,
  hint,
}: {
  label: string;
  value: React.ReactNode;
  /** Qualifier shown next to the value, e.g. an untrusted-odometer brand. */
  hint?: string | null;
}) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div className="flex items-start justify-between gap-4 border-b border-char-100 py-2.5 text-sm last:border-0">
      <span className="shrink-0 text-char-500">{label}</span>
      <span className="text-right font-medium text-char-900">
        {value}
        {hint && <span className="ml-1.5 font-semibold text-amber-600">{hint}</span>}
      </span>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-char-200 bg-white p-5">
      <h2 className="text-sm font-bold uppercase tracking-wider text-char-400">{title}</h2>
      <div className="mt-2">{children}</div>
    </div>
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ vin: string }>;
}): Promise<Metadata> {
  const { vin } = await params;
  // Individual auction lots expire/change constantly - not worth indexing,
  // and keeps crawlers from methodically working through every result-card
  // link (each view costs a real Apibara API call).
  const robots = { index: false, follow: false };
  try {
    const { data } = await getAuctionSource().getVehicleDetail(vin);
    return { title: `${data.title} — SmartAutoBid`, robots };
  } catch {
    return { title: "Vehicle — SmartAutoBid", robots };
  }
}

export default async function VehicleDetailPage({
  params,
}: {
  params: Promise<{ locale: string; vin: string }>;
}) {
  const { locale, vin } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("VehicleDetail");
  /** The similar-lots grid is the same LotCard the search page renders, so it
   *  borrows the one place that badge is worded rather than growing a second. */
  const tSearch = await getTranslations("Search");
  const countdownLabels = {
    dayShort: t("auction.dayShort"),
    hourShort: t("auction.hourShort"),
    minuteShort: t("auction.minuteShort"),
    secondShort: t("auction.secondShort"),
  };

  const source = getAuctionSource();

  let detail: VehicleDetailResponse["data"] | null = null;
  try {
    const res = await source.getVehicleDetail(vin);
    detail = res.data;
  } catch {
    notFound();
  }
  if (!detail) notFound();

  const related = await source.getRelatedVehicles(vin).catch(() => null);
  const soldStats = related ? computeSoldPriceStats(related.data.past) : null;
  const valuation = extractIaaiValuation(detail);
  const deepSpecs = extractLotDeepSpecs(detail);
  const { engineVideoUrl, view360Url } = extractMediaExtras(detail);

  const photos =
    detail.media?.items
      ?.filter((i) => i.type === "image" && i.large && i.thumb)
      .map((i) => ({ thumb: i.thumb as string, large: i.large as string })) ?? [];

  // Two filters, and the second is the one that matters.
  //
  // `upcoming` occasionally contains the lot being viewed; showing a card that
  // links back to the current page would just be a dead end.
  //
  // It also contains lots that have already sold — measured 2026-08-12, ALL of
  // them did: 36 of 36 entries across three seed lots were finished, sold, and
  // dated February or March, under a heading that promises upcoming auctions.
  // The owner reported it after seeing February cars there. `isStillUpcoming`
  // checks the entry's own state, countdown and sale date, so the heading is
  // true of every card left. When the source has nothing genuinely upcoming to
  // say, the block does not render at all — an empty section is a smaller lie
  // than a full one.
  const upcoming = (related?.data.upcoming ?? [])
    .filter((v) => v.vin !== detail.vin && isStillUpcoming(v))
    .slice(0, 6);

  const saleDate = detail.auction?.full_date ?? detail.auction?.auction_at ?? null;
  /**
   * The sale time as the reader's own clock would show it.
   *
   * `detail.auction.formatted` is the vendor's rendering — English, and in a
   * zone they chose — so printing it put a different hour in the spec table
   * from the one the countdown above was counting towards. It survives only as
   * the pre-hydration fallback; see shared/time/LocalDateTime.
   */
  const auctionDateSpec = saleDate ? (
    <LocalDateTime iso={saleDate} locale={locale} fallback={detail.auction?.formatted ?? null} />
  ) : (
    (detail.auction?.formatted ?? null)
  );
  // Decided from Apibara's own `diff_minutes` rather than a clock read here,
  // so the render stays pure and the answer matches the cached payload it came
  // with. If the sale tips over while a cached page is being served, the
  // countdown component itself falls through to "auction closed".
  const diffMinutes = detail.auction?.diff_minutes ?? null;
  const isUpcoming =
    diffMinutes !== null ? diffMinutes > 0 : detail.auction?.state === "open";

  // A lot whose sale has already run can't be bid on, so the page must not
  // offer to bid on it - it becomes a price-reference record instead. Treated
  // as closed on either signal, since `state` and `diff_minutes` are computed
  // independently by the source and either one alone can lag.
  const auctionUrl = auctionLotUrl(detail.platform, detail.lot_number);
  const auctionName = auctionDisplayName(detail.platform);
  const saleClosed = detail.auction?.state === "finished" || !isUpcoming;
  // One query, and only when somebody is signed in. This page is noindex and
  // already dynamic, so reading the session costs it nothing.
  const viewer = await currentUser();
  const alreadySaved = viewer
    ? (await savedLotKeys(viewer.id)).has(lotKey(detail.platform, detail.lot_number))
    : false;

  // Which cars a signed-in client actually opens — the baseline signal behind
  // the history on /admin/users/[id]. Recorded here rather than from the
  // browser because this page is already dynamic (it reads the session above),
  // so the write costs no caching and needs no client JavaScript under the
  // strict CSP.
  //
  // `recordVisit`, not `recordActivity`: Next prefetches linked pages on hover
  // and executes this component to do it. See the header check there — without
  // it, every lot card that scrolled past would be logged as a car they looked
  // at.
  if (viewer) {
    await recordVisit({
      userId: viewer.id,
      kind: "lot.viewed",
      subjectKey: lotSubjectKey(detail.platform, detail.lot_number),
      // Absent, not zero: Copart lots routinely carry no bid before bidding
      // opens, and "$0" in a history is a price nobody offered.
      label: lotLabel(
        detail.title,
        detail.pricing?.current_bid_usd ? Math.round(detail.pricing.current_bid_usd * 100) : null
      ),
      detail: { vin: detail.vin, lot: detail.lot_number, platform: detail.platform },
    });
  }

  const soldPriceUsd = detail.pricing?.last_sold_price_usd ?? null;
  const soldDay = detail.auction?.last_sold_day ?? null;
  const wasSold =
    saleClosed && (detail.auction?.last_sold_status === "Sold" || (soldPriceUsd ?? 0) > 0);
  const currentBid = detail.pricing?.current_bid_usd ?? null;
  const buyNow = detail.pricing?.buy_now_usd ?? null;

  // Where the marker sits on the comparable-sales bar. Clamped so a bid well
  // outside the comparable range still renders on the track instead of
  // overflowing it.
  const markerBid = buyNow ?? currentBid;
  const markerPercent =
    soldStats && markerBid && soldStats.max > soldStats.min
      ? Math.min(100, Math.max(0, ((markerBid - soldStats.min) / (soldStats.max - soldStats.min)) * 100))
      : null;

  return (
    <>
      {/* Only rendered when this lot came from our own copy because the upstream
          aggregator was unreachable. `mirror_as_of` is absent on every normal
          response, so this cannot appear while upstream is healthy — but when it
          does, the visitor is told the age of what they are looking at rather than
          shown a stale bid as if it were current. */}
      {detail.mirror_as_of && (
        <div className="border-b border-amber-300 bg-amber-50">
          <Container>
            <div className="flex items-start gap-3 py-4">
              <Info size={20} weight="duotone" className="mt-0.5 shrink-0 text-amber-600" />
              <div className="text-sm">
                <p className="font-bold text-char-900">{t("staleMirror.title")}</p>
                <p className="mt-1 leading-relaxed text-char-700">
                  {t("staleMirror.note", {
                    date: new Date(detail.mirror_as_of).toLocaleString(locale, {
                      dateStyle: "medium",
                      timeStyle: "short",
                    }),
                  })}
                </p>
              </div>
            </div>
          </Container>
        </div>
      )}

      <section className="border-b border-char-100 bg-gradient-to-b from-amber-50/50 to-background py-8 sm:py-10">
        <Container>
          <Reveal className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-wider text-char-400">
            {/* The platform badge doubles as a link to the lot on the auction's
                own site, so a client can check this page against the source.
                A trust feature, and the reason it is the badge rather than a
                separate button: it is where somebody already looks to see which
                auction the car is at. Falls back to a plain badge when the lot
                number or platform is not something we can build a URL from —
                see auctionLotUrl, which refuses to guess. */}
            {auctionUrl ? (
              <>
                <a
                  id="auction-source-link"
                  href={auctionUrl}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="inline-flex items-center gap-1.5 rounded-full bg-char-900 px-2.5 py-1 text-white transition-colors hover:bg-amber-600"
                  title={t("viewOnAuction", { auction: auctionName ?? detail.platform })}
                >
                  {detail.platform}
                  <ArrowSquareOut size={12} weight="bold" />
                </a>
                {/* Renders nothing; only listens. Mounted only for signed-in
                    clients, since there is no history to write for anyone
                    else. */}
                {viewer && (
                  <AuctionLinkTracker
                    anchorId="auction-source-link"
                    platform={detail.platform}
                    lotNumber={detail.lot_number}
                  />
                )}
              </>
            ) : (
              <span className="rounded-full bg-char-900 px-2.5 py-1 text-white">
                {detail.platform}
              </span>
            )}
            <span>{t("lot", { number: detail.lot_number })}</span>
            {saleClosed && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-char-200 px-2.5 py-1 text-char-700">
                <Archive size={12} weight="fill" />
                {wasSold ? t("archived.soldBadge") : t("archived.endedBadge")}
              </span>
            )}
            {!saleClosed && detail.auction?.is_buy_now && (
              <span className="rounded-full bg-amber-100 px-2.5 py-1 text-amber-700">
                {t("auction.buyNowBadge")}
              </span>
            )}
            {!saleClosed && detail.auction?.is_timed && (
              <span className="rounded-full bg-char-100 px-2.5 py-1 text-char-600">
                {t("auction.timedBadge")}
              </span>
            )}
          </Reveal>

          <Reveal delay={0.05} className="mt-3 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-2xl font-extrabold tracking-tight text-char-900 sm:text-3xl">
                {detail.title}
              </h1>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-char-600">
                <span className="inline-flex items-center gap-1.5">
                  <Barcode size={15} className="text-char-400" />
                  <span className="font-mono text-xs">{detail.vin}</span>
                </span>
                {detail.location?.display && (
                  <span className="inline-flex items-center gap-1.5">
                    <MapPin size={15} className="text-char-400" /> {detail.location.display}
                  </span>
                )}
                {detail.seller?.name && (
                  <span className="inline-flex items-center gap-1.5">
                    <Storefront size={15} className="text-char-400" /> {detail.seller.name}
                  </span>
                )}
                {detail.sale_document?.name && (
                  <span className="inline-flex items-center gap-1.5">
                    <Info size={15} className="text-char-400" /> {detail.sale_document.name}
                  </span>
                )}
              </div>

              {/* Offered on sold lots too, deliberately. Someone comparing
                  what similar cars actually went for still wants to keep the
                  reference, and the saved card is dated — so it never implies
                  a closed lot is still available. */}
              <div className="mt-4">
                {/* The LOT is saved, not the VIN. This reference is what a
                    later refresh re-fetches, so saving a VIN would quietly
                    resolve to a different appearance of the same car and
                    overwrite the snapshot with another sale's price — the same
                    fault as the card links, only delayed. */}
                <SaveLotButton
                  lot={detail.lot_number || detail.vin}
                  initiallySaved={alreadySaved}
                  signedIn={viewer !== null}
                  variant="detail"
                />
              </div>
            </div>

            {saleDate && (
              <AuctionDateCard
                isoDate={saleDate}
                formatted={detail.auction?.formatted ?? null}
                locale={locale}
                isUpcoming={isUpcoming}
                labels={{
                  endsIn: t("auction.endsIn"),
                  saleDate: t("auction.saleDate"),
                  closed: t("auction.closed"),
                  dayShort: t("auction.dayShort"),
                  hourShort: t("auction.hourShort"),
                  minuteShort: t("auction.minuteShort"),
                  secondShort: t("auction.secondShort"),
                }}
              />
            )}
          </Reveal>
        </Container>
      </section>

      <section className="py-8 sm:py-12">
        <Container>
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-5">
            <div className="space-y-5 lg:col-span-3">
              <Reveal>
                <InventoryGallery
                  photos={photos}
                  title={detail.title}
                  engineVideoUrl={engineVideoUrl}
                  view360Url={view360Url}
                />
              </Reveal>

              {/* Market context: real comparable sales, plus the source's own
                  valuation numbers where it publishes them. */}
              {(soldStats || valuation) && (
                <Reveal delay={0.05}>
                  <div className="rounded-2xl border border-char-200 bg-white p-5">
                    <h2 className="text-sm font-bold uppercase tracking-wider text-char-400">
                      {t("market.title")}
                    </h2>

                    {soldStats && (
                      <>
                        <div className="mt-4 flex items-end justify-between text-sm">
                          <span>
                            <span className="block text-lg font-bold text-char-900">
                              {formatUsd(soldStats.min)}
                            </span>
                            <span className="text-xs text-char-500">{t("market.min")}</span>
                          </span>
                          <span className="text-center">
                            <span className="block text-lg font-bold text-char-900">
                              {formatUsd(soldStats.avg)}
                            </span>
                            <span className="text-xs text-char-500">{t("market.avg")}</span>
                          </span>
                          <span className="text-right">
                            <span className="block text-lg font-bold text-char-900">
                              {formatUsd(soldStats.max)}
                            </span>
                            <span className="text-xs text-char-500">{t("market.max")}</span>
                          </span>
                        </div>

                        <div className="relative mt-3 h-2 rounded-full bg-gradient-to-r from-emerald-400 via-amber-400 to-red-400">
                          {markerPercent !== null && (
                            <span
                              className="absolute -top-1 h-4 w-1 -translate-x-1/2 rounded-full bg-char-900 ring-2 ring-white"
                              style={{ left: `${markerPercent}%` }}
                              aria-hidden
                            />
                          )}
                        </div>
                        <p className="mt-2.5 text-xs leading-relaxed text-char-500">
                          {t("market.basis", { count: soldStats.sampleSize })}
                        </p>
                      </>
                    )}

                    {valuation && (
                      <div className="mt-4 grid grid-cols-1 gap-3 border-t border-char-100 pt-4 sm:grid-cols-2">
                        {valuation.actualCashValueUsd != null && (
                          <div className="rounded-xl bg-char-50 p-3.5">
                            <p className="text-lg font-bold text-char-900">
                              {formatUsd(valuation.actualCashValueUsd)}
                            </p>
                            <p className="text-xs text-char-500">{t("market.actualCashValue")}</p>
                          </div>
                        )}
                        {valuation.estimatedRepairCostUsd != null && (
                          <div className="rounded-xl bg-char-50 p-3.5">
                            <p className="text-lg font-bold text-char-900">
                              {formatUsd(valuation.estimatedRepairCostUsd)}
                            </p>
                            <p className="text-xs text-char-500">
                              {t("market.estimatedRepairCost")}
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </Reveal>
              )}

              <Reveal delay={0.1} className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                <Card title={t("condition.title")}>
                  <Spec
                    label={t("condition.runCondition")}
                    value={detail.condition?.run_condition?.label}
                  />
                  <Spec
                    label={t("condition.primaryDamage")}
                    value={detail.condition?.primary_damage}
                  />
                  <Spec
                    label={t("condition.secondaryDamage")}
                    value={detail.condition?.secondary_damage ?? t("condition.unknown")}
                  />
                  <Spec label={t("condition.lossType")} value={deepSpecs?.lossType} />
                  <Spec
                    label={t("condition.keys")}
                    value={detail.condition?.has_key ? t("condition.yes") : t("condition.no")}
                  />
                  <Spec
                    label={t("condition.keyFob")}
                    value={deepSpecs?.hasKeyFob ? t("condition.yes") : null}
                  />
                  {/* A 0 here means "not reported", which is how Copart sends
                      an unknown reading - printing "0 mi" would state a fact
                      the source never claimed. */}
                  <Spec
                    label={t("condition.odometer")}
                    value={
                      typeof detail.odometer?.mi === "number" && detail.odometer.mi > 0
                        ? `${detail.odometer.mi.toLocaleString()} mi${
                            typeof detail.odometer.km === "number" && detail.odometer.km > 0
                              ? ` (${detail.odometer.km.toLocaleString()} km)`
                              : ""
                          }`
                        : undefined
                    }
                    hint={deepSpecs?.odometerBrand}
                  />
                  <Spec label={t("condition.airbags")} value={detail.vehicle_specs?.airbags} />
                  <Spec
                    label={t("condition.vehicleGrade")}
                    value={deepSpecs?.vehicleGrade}
                  />
                  <Spec
                    label={t("condition.catalyticConverter")}
                    value={deepSpecs?.catalyticConverter}
                  />
                </Card>

                <Card title={t("vehicle.title")}>
                  <Spec label={t("vehicle.year")} value={detail.year} />
                  <Spec label={t("vehicle.make")} value={detail.make} />
                  <Spec label={t("vehicle.model")} value={detail.model} />
                  <Spec label={t("vehicle.series")} value={deepSpecs?.series} />
                  <Spec label={t("vehicle.bodyStyle")} value={detail.vehicle_specs?.body_style} />
                  <Spec label={t("vehicle.engine")} value={detail.vehicle_specs?.engine?.raw} />
                  <Spec label={t("vehicle.cylinders")} value={deepSpecs?.cylinders} />
                  <Spec
                    label={t("vehicle.transmission")}
                    value={detail.vehicle_specs?.transmission}
                  />
                  <Spec label={t("vehicle.driveType")} value={detail.vehicle_specs?.drive_type} />
                  <Spec label={t("vehicle.fuelType")} value={detail.vehicle_specs?.fuel_type} />
                  <Spec label={t("vehicle.color")} value={detail.vehicle_specs?.exterior_color} />
                  <Spec label={t("vehicle.interiorColor")} value={deepSpecs?.interiorColor} />
                  <Spec label={t("vehicle.countryOfOrigin")} value={deepSpecs?.countryOfOrigin} />
                  <Spec label={t("vehicle.navigation")} value={deepSpecs?.navigation} />
                  <Spec label={t("vehicle.options")} value={deepSpecs?.options} />
                </Card>
              </Reveal>

              <Reveal delay={0.15}>
                <Card title={t("sale.title")}>
                  <Spec label={t("sale.lotNumber")} value={detail.lot_number} />
                  <Spec label={t("sale.seller")} value={detail.seller?.name} />
                  <Spec label={t("sale.saleDocument")} value={detail.sale_document?.name} />
                  <Spec label={t("sale.titleState")} value={deepSpecs?.titleState} />
                  <Spec label={t("sale.titleBrand")} value={deepSpecs?.titleBrand} />
                  <Spec label={t("sale.auctionDate")} value={auctionDateSpec} />
                  <Spec label={t("sale.branch")} value={deepSpecs?.branchAddress} />
                  {/* The US port the branch feeds into - this is the leg our
                      ocean-freight estimate is actually priced from. */}
                  <Spec
                    label={t("sale.departurePort")}
                    value={detail.location?.send_from ?? undefined}
                  />
                  <Spec
                    label={t("sale.bidIncrement")}
                    value={
                      deepSpecs?.bidIncrementUsd ? formatUsd(deepSpecs.bidIncrementUsd) : undefined
                    }
                  />

                  {typeof detail.sale_document?.export === "boolean" && (
                    <div className="mt-3 flex flex-wrap gap-2 border-t border-char-100 pt-3">
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ${
                          detail.sale_document.export
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-red-50 text-red-700"
                        }`}
                      >
                        {detail.sale_document.export ? (
                          <CheckCircle size={14} weight="fill" />
                        ) : (
                          <XCircle size={14} weight="fill" />
                        )}
                        {detail.sale_document.export
                          ? t("sale.exportable")
                          : t("sale.notExportable")}
                      </span>
                      {typeof detail.sale_document.registration === "boolean" && (
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ${
                            detail.sale_document.registration
                              ? "bg-emerald-50 text-emerald-700"
                              : "bg-char-100 text-char-600"
                          }`}
                        >
                          {detail.sale_document.registration ? (
                            <CheckCircle size={14} weight="fill" />
                          ) : (
                            <XCircle size={14} weight="fill" />
                          )}
                          {detail.sale_document.registration
                            ? t("sale.registrable")
                            : t("sale.notRegistrable")}
                        </span>
                      )}
                    </div>
                  )}
                </Card>
              </Reveal>
            </div>

            {/* Sticky so the running total stays visible while the buyer reads
                down the spec columns - the whole point of the panel is to
                answer "what does this actually cost me" at any scroll depth. */}
            <Reveal delay={0.1} className="lg:col-span-2">
              <div className="lg:sticky lg:top-24">
                {saleClosed ? (
                  /* Archived record: the sale has already run, so this shows
                     what it went for and offers no way to bid on it. */
                  <div className="rounded-2xl border border-char-200 bg-white p-5">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-char-100 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-char-600">
                      <Archive size={13} weight="fill" />
                      {wasSold ? t("archived.soldBadge") : t("archived.endedBadge")}
                    </span>
                    <h2 className="mt-3 text-lg font-bold text-char-900">
                      {wasSold ? t("archived.titleSold") : t("archived.titleEnded")}
                    </h2>

                    {wasSold && soldPriceUsd !== null && (
                      <div className="mt-4 rounded-xl bg-char-900 p-4 text-white">
                        <p className="text-xs font-semibold uppercase tracking-wider text-white/60">
                          {t("archived.soldFor")}
                        </p>
                        <p className="mt-1 text-3xl font-extrabold tabular-nums">
                          {formatUsd(soldPriceUsd)}
                        </p>
                        {soldDay && (
                          <p className="mt-0.5 text-sm text-white/70">
                            {t("archived.soldOn", { date: soldDay })}
                          </p>
                        )}
                      </div>
                    )}

                    <div className="mt-4">
                      <Spec
                        label={t("pricing.finalBid")}
                        value={formatPrice(currentBid) ?? t("pricing.notAvailable")}
                      />
                      <Spec label={t("sale.auctionDate")} value={auctionDateSpec} />
                    </div>

                    <p className="mt-4 text-sm leading-relaxed text-char-600">
                      {t("archived.note")}
                    </p>

                    <Button
                      href={`/search?${new URLSearchParams({
                        make: detail.make,
                        model: detail.model,
                      })}`}
                      className="mt-4 w-full justify-center"
                    >
                      {t("archived.ctaSearch")}
                    </Button>
                  </div>
                ) : (
                  <>
                    <div className="rounded-2xl border border-char-200 bg-white p-5">
                      <h2 className="text-sm font-bold uppercase tracking-wider text-char-400">
                        {t("pricing.title")}
                      </h2>
                      <div className="mt-3">
                        <Spec
                          label={t("pricing.currentBid")}
                          value={formatPrice(currentBid) ?? t("pricing.notAvailable")}
                        />
                        <Spec label={t("pricing.buyNow")} value={formatPrice(buyNow)} />
                        <Spec label={t("pricing.lastSold")} value={formatPrice(soldPriceUsd)} />
                      </div>
                    </div>

                    <div className="mt-5">
                      <VehicleCostPanel
                        currentBidUsd={currentBid}
                        buyNowUsd={buyNow}
                        pickupLocation={
                          detail.location?.display
                            ? normalizeApibaraLocation(detail.location.display)
                            : ""
                        }
                        auctionNetwork={detail.platform}
                        vehicleKind={inferCoreVehicleKind(
                          detail.vehicle_specs?.body_style ?? detail.type
                        )}
                        detectedUsaMade={isUsaManufactured(detail)}
                        countryOfOrigin={deepSpecs?.countryOfOrigin ?? null}
                        bidIncrementUsd={deepSpecs?.bidIncrementUsd ?? null}
                        lotTitle={detail.title}
                        vin={detail.vin}
                        lotNumber={detail.lot_number}
                      />
                    </div>
                  </>
                )}

                <div className="mt-5 flex items-start gap-3 rounded-2xl border border-char-200 bg-char-50 p-5 text-sm text-char-600">
                  <Info size={18} className="mt-0.5 shrink-0 text-char-400" />
                  <p>{saleClosed ? t("disclaimerArchived") : t("disclaimer")}</p>
                </div>
              </div>
            </Reveal>
          </div>

          {related && related.data.past.length > 0 && (
            <Reveal delay={0.1} className="mt-8">
              <PastSalesTable
                past={related.data.past}
                labels={{
                  title: t("pastSales.title"),
                  count: t("pastSales.count", {
                    count: related.data.past.filter(
                      (v) => (v.pricing?.last_sold_price_usd ?? 0) > 0
                    ).length,
                  }),
                  vehicle: t("pastSales.vehicle"),
                  sold: t("pastSales.sold"),
                  odometer: t("pastSales.odometer"),
                  damage: t("pastSales.damage"),
                  price: t("pastSales.price"),
                }}
              />
            </Reveal>
          )}

          {upcoming.length > 0 && (
            <Reveal delay={0.15} className="mt-12">
              <h2 className="text-xl font-extrabold tracking-tight text-char-900 sm:text-2xl">
                {t("similar.title")}
              </h2>
              <p className="mt-1.5 text-sm text-char-600">{t("similar.subtitle")}</p>
              <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {upcoming.map((v) => (
                  <LotCard
                    key={`${v.platform}-${v.vin}`}
                    vehicle={v}
                    labels={{
                      noPhoto: t("similar.noPhoto"),
                      priceNA: t("pricing.notAvailable"),
                      damagePrefix: t("similar.damagePrefix"),
                      // The page's own pricing labels, reused deliberately: a
                      // card and the panel above it must not call the same
                      // number two different things.
                      currentBid: t("pricing.currentBid"),
                      buyNow: t("pricing.buyNow"),
                      madeInUsa: tSearch("results.madeInUsa"),
                    }}
                    usaMade={isUsaBuiltVin(v.vin)}
                    countdownSlot={(() => {
                      // Same rule as the search grid: a countdown only where
                      // the sale instant is this lot's own. These rows have
                      // already passed isStillUpcoming(), but that answers
                      // "is it in the future", not "is this date per-lot".
                      const at = ownSaleInstant(v);
                      return at ? <LotCountdown iso={at} labels={countdownLabels} /> : null;
                    })()}
                  />
                ))}
              </div>
            </Reveal>
          )}
        </Container>
      </section>

      <section className="bg-char-900 py-16 text-white sm:py-20">
        <Container>
          <Reveal className="grid grid-cols-1 items-center gap-10 lg:grid-cols-2">
            <div>
              <h2 className="text-2xl font-extrabold tracking-tight sm:text-3xl">
                {t("delivery.title")}
              </h2>
              <p className="mt-4 leading-relaxed text-white/70">{t("delivery.body")}</p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Button href="/contact">
                  {saleClosed ? t("delivery.ctaGeneric") : t("delivery.cta")}
                </Button>
                <Button href="/shipping" variant="ghost-light">
                  {t("delivery.ctaSecondary")}
                </Button>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:grid-cols-1">
              {DELIVERY_PORTS.map((port) => (
                <div
                  key={port}
                  className="flex items-center gap-3 rounded-2xl border border-white/15 bg-white/5 px-5 py-4"
                >
                  <Anchor size={20} weight="duotone" className="shrink-0 text-amber-400" />
                  <span className="font-semibold">{port}</span>
                </div>
              ))}
            </div>
          </Reveal>
        </Container>
      </section>
    </>
  );
}
