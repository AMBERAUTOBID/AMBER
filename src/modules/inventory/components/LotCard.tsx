import { MapPin, Gauge, GasPump, GearSix, Engine, Palette, FileText } from "@phosphor-icons/react/dist/ssr";
import { Link } from "@/i18n/navigation";
import type { VehicleListItem } from "@/modules/inventory/api";
import { formatOdometer } from "@/modules/inventory/model/formatOdometer";
import { engineDisplay, titleCaseSpec } from "@/modules/inventory/model/cardSpecs";
import { normalizeTitle } from "@/modules/inventory/model/lotNormalize";
import { platformBadgeClass } from "@/modules/inventory/model/platformBrand";
import { formatLotTitle } from "@/modules/inventory/model/modelTree";
import MadeInUsaBadge from "@/modules/inventory/components/MadeInUsaBadge";
import CardPhoto from "@/modules/inventory/components/CardPhoto";

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
  saveSlot,
  usaMade,
  countdownSlot,
}: {
  vehicle: VehicleListItem;
  labels: {
    noPhoto: string;
    priceNA: string;
    damagePrefix: string;
    currentBid: string;
    buyNow: string;
    madeInUsa?: string;
    /**
     * The SAME translated bucket names the document filter shows
     * (`Search.filters.options.title`). The card used to print the auction's
     * raw wording — IAAI's "Clear (Florida)" beside Copart's "MD - CERT OF
     * TITLE-SALVAGE" — and the owner read "Clear" as a category the filters
     * don't offer. One vocabulary on filter and card ends that; the raw
     * string still shows on the lot page, where legal nuance belongs.
     */
    documentTypes?: Record<string, string>;
  };
  /**
   * Whether the car was built in the United States — `null` when the VIN can't
   * say, which is not the same as "no".
   *
   * Decided by the caller rather than here, and deliberately: the same fact
   * drives the 0% import duty in `modules/pricing`, and a second rule living in
   * `inventory` is how a card would come to fly a flag over a quote that still
   * charged 10%. One source, passed in.
   */
  usaMade?: boolean | null;
  /**
   * Time left until the sale. A slot rather than a date prop, because the
   * countdown must tick and this card is a synchronous server component — and
   * because whether a row's timing can be trusted at all is a question about
   * the source, which the caller is the one that knows.
   */
  countdownSlot?: React.ReactNode;
  /**
   * The save-to-favourites control, injected rather than imported.
   *
   * It has to be a client component (it posts and holds state) while this
   * card stays a synchronous server component, and it must render OUTSIDE
   * the Link below — a button nested inside an anchor is invalid HTML, and
   * clicking it would navigate to the lot as well as saving it.
   */
  saveSlot?: React.ReactNode;
}) {
  const photo = vehicle.media?.thumbs?.[0];
  /**
   * A price on a card has to say what kind of price it is.
   *
   * This used to print `current_bid ?? buy_now` bare, and the two are different
   * promises: lot 51211316 showed $2,450 here and $1,850 on its own page, both
   * correct — one the buy-now offer, the other the standing bid — and the pair
   * reads as a contradiction. Reported by the owner, 2026-08-12.
   *
   * The bid leads because it is what the auction is actually doing. Buy Now
   * follows on its own line whenever it exists, so a visitor filtering for Buy
   * Now sees the number they are shopping for on every card rather than on the
   * 66% that happen to have no bid yet.
   */
  const bid = formatPrice(vehicle.pricing?.current_bid_usd);
  const buyNow = formatPrice(vehicle.pricing?.buy_now_usd);
  const headline = bid ?? buyNow;
  const headlineKind = bid ? labels.currentBid : buyNow ? labels.buyNow : null;
  const odometerLabel = formatOdometer(vehicle.odometer);

  /**
   * The spec chips, owner-requested 2026-08-21 after seeing a competitor's
   * cards. Icon + value, no label words — which is what lets this ship without
   * a single new locale key. All five fields arrive IN the search response the
   * card already has (94–99% coverage measured on 122k upcoming lots), so the
   * row costs zero extra Apibara calls on either source; a missing field just
   * leaves its chip out.
   */
  const specs = vehicle.vehicle_specs;
  const fuel = specs?.fuel_type ? titleCaseSpec(specs.fuel_type) : null;
  const gearbox = specs?.transmission ? titleCaseSpec(specs.transmission) : null;
  const engine = specs?.engine?.raw ? engineDisplay(specs.engine.raw) : null;
  const color = specs?.exterior_color ? titleCaseSpec(specs.exterior_color) : null;
  /**
   * The filter's word for the document, not the auction's. `normalizeTitle`
   * folds both dialects into the six buckets the filter offers (IAAI's "Clear"
   * IS the clean bucket); `other` falls back to the raw string because "Other"
   * on a card says nothing while "DEALER ONLY" at least says something.
   */
  const docName = vehicle.sale_document?.name ?? null;
  const docBucket = docName ? normalizeTitle(docName) : null;
  const docLabel =
    docBucket && docBucket !== "other"
      ? (labels.documentTypes?.[docBucket] ?? docName)
      : docName;

  return (
    // The wrapper carries the hover treatment and `group`, so hovering the
    // save button lifts the card too rather than fighting it.
    //
    // `h-full flex flex-col`: both containers this card lives in stretch their
    // children (the home rail is a flex row, the search results a grid), but
    // without this the card itself stopped at its content and a row of cards
    // ended at five different heights — owner reported it on the rail
    // 2026-08-21. The card fills the stretched slot and the body below anchors
    // its last block to the bottom, so the variance (a Buy Now line, a
    // countdown, a wrapped damage note) is absorbed mid-card instead of
    // showing as a ragged bottom edge.
    <div className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-char-200 bg-white transition-all hover:-translate-y-1 hover:border-amber-300 hover:shadow-xl hover:shadow-amber-900/5">
      {saveSlot && <div className="absolute right-2.5 top-2.5 z-10">{saveSlot}</div>}
      {/*
        BY LOT NUMBER, NOT BY VIN — and that is the whole fix for a card that
        opened somebody else's sale.

        A VIN names a CAR; a lot number names one APPEARANCE of that car at
        auction. Cars are auctioned more than once, so `/vehicle/{vin}` asks
        upstream a question with several right answers and it picks its own.
        Measured 2026-08-12 on VIN WAUAUGFF0J1031237: the card offered lot
        59726116 (open, buy now $4,400, sale 13 Aug) and the page it opened was
        lot 72702635 — the same car SOLD on 1 July for $4,750. The visitor saw
        "PARDUOTA" on a car that was for sale the next day. Asking for the lot
        returns the open record, verified against the live endpoint.

        Known residue, measured rather than assumed: the identity upstream is
        really (platform, lot number), and 29 of our 143,331 lot numbers exist
        on BOTH copart and iaai. For those, upstream answers with one of the
        two and no parameter changes its mind — `?platform=` and `?site=` were
        both tried and ignored. 29 ambiguous is the price of fixing every car
        that has ever been auctioned twice; the trade is deliberate.
      */}
      <Link href={`/vehicle/${vehicle.lot_number}`} className="flex flex-1 flex-col">
      <div className="relative aspect-[4/3] w-full shrink-0 overflow-hidden bg-char-100">
        {photo ? (
          // The img itself lives in a small client component so a DEAD photo
          // (upstream 404 — they exist in the catalogue) collapses into the
          // same "no photo" state below instead of the browser's broken-image
          // glyph. The lazy-loading and sizing rationale moved with it.
          <CardPhoto src={photo} alt={vehicle.title} noPhotoLabel={labels.noPhoto} />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-char-500">
            {labels.noPhoto}
          </div>
        )}
        <div className="absolute left-2.5 top-2.5 flex flex-col items-start gap-1.5">
          <span
            className={`rounded-full px-2.5 py-1 text-xs font-semibold uppercase tracking-wider text-white backdrop-blur-sm ${platformBadgeClass(vehicle.platform, "photo")}`}
          >
            {vehicle.platform}
          </span>
          {/* Only when the VIN actually says so. `usaMade === null` means the
              VIN could not answer — a pre-1981 format, or none recorded — and
              an absent flag is the honest rendering of "we don't know". */}
          {usaMade === true && labels.madeInUsa && (
            <MadeInUsaBadge label={labels.madeInUsa} />
          )}
        </div>
      </div>
      <div className="flex flex-1 flex-col p-4">
        {/* Both sources shout the make and model in upper case, and both keep
            the auctions catch-all buckets in it. See formatLotTitle. */}
        <h3 className="line-clamp-1 font-bold text-char-900">{formatLotTitle(vehicle.title)}</h3>
        {/* Three chips, never four: fuel + gearbox + litres always fit one
            line at the card's 17rem; colour made the row wrap on half the
            cards and now lives on its own line below — the owner asked for
            one detail per line after seeing the ragged mix, 2026-08-21. */}
        {(fuel || gearbox || engine) && (
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-char-500">
            {fuel && (
              <span className="inline-flex items-center gap-1">
                <GasPump size={13} /> {fuel}
              </span>
            )}
            {gearbox && (
              <span className="inline-flex items-center gap-1">
                <GearSix size={13} /> {gearbox}
              </span>
            )}
            {engine && (
              <span className="inline-flex items-center gap-1">
                <Engine size={13} /> {engine}
              </span>
            )}
          </div>
        )}
        <div className="mt-1 flex items-baseline gap-2">
          <p className="text-lg font-bold text-amber-600">{headline ?? labels.priceNA}</p>
          {headlineKind && (
            <span className="text-xs text-char-500">{headlineKind}</span>
          )}
        </div>
        {/* Only when it is not already the headline — otherwise the same number
            would be printed twice under two different names. */}
        {buyNow && bid && (
          <p className="mt-0.5 text-sm font-semibold text-char-700">
            {labels.buyNow} <span className="text-amber-600">{buyNow}</span>
          </p>
        )}
        {/* min-height because LotCountdown deliberately renders nothing until
            the client clock starts: without the reservation every card grew a
            line a beat after first paint, which read as the row jumping. */}
        {countdownSlot && <div className="mt-1.5 min-h-5">{countdownSlot}</div>}
        {/* `mt-auto`: the detail block sits on the card's bottom edge, so
            equal-height cards read as aligned rows rather than equal boxes
            with ragged interiors. ONE detail per line, owner's call
            2026-08-21: location and odometer used to share a wrapping row,
            which laid the same facts out differently on every other card. */}
        <div className="mt-auto flex flex-col gap-y-1 pt-2 text-xs text-char-500">
          {color && (
            <span className="inline-flex items-center gap-1">
              <Palette size={13} className="shrink-0" /> {color}
            </span>
          )}
          {vehicle.location?.display && (
            <span className="inline-flex items-center gap-1">
              <MapPin size={13} className="shrink-0" /> {vehicle.location.display}
            </span>
          )}
          {/* Miles with kilometres beside them: the auctions publish miles, the
              buyer thinks in kilometres. A zero or one-mile reading is printed
              rather than hidden — it is what the auction recorded, and 12,656
              searchable lots read one or the other. */}
          {odometerLabel && (
            <span className="inline-flex items-center gap-1">
              <Gauge size={13} className="shrink-0" /> {odometerLabel}
            </span>
          )}
          {/* The sale document decides more purchases than any spec — salvage
              and clean title are different products. */}
          {docLabel && (
            <span className="flex min-w-0 items-center gap-1">
              <FileText size={13} className="shrink-0" />
              <span className="truncate">{docLabel}</span>
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
    </div>
  );
}
