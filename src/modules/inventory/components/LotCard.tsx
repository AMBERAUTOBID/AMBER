import { MapPin, Gauge } from "@phosphor-icons/react/dist/ssr";
import { Link } from "@/i18n/navigation";
import type { VehicleListItem } from "@/modules/inventory/api";
import { formatOdometer } from "@/modules/inventory/model/formatOdometer";
import { formatLotTitle } from "@/modules/inventory/model/modelTree";
import MadeInUsaBadge from "@/modules/inventory/components/MadeInUsaBadge";

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

  return (
    // The wrapper carries the hover treatment and `group`, so hovering the
    // save button lifts the card too rather than fighting it.
    <div className="group relative overflow-hidden rounded-2xl border border-char-200 bg-white transition-all hover:-translate-y-1 hover:border-amber-300 hover:shadow-xl hover:shadow-amber-900/5">
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
      <Link href={`/vehicle/${vehicle.lot_number}`} className="block">
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-char-100">
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photo}
            alt={vehicle.title}
            /**
             * ⚠️ TWENTY OF THESE LOAD AT ONCE ON A SEARCH PAGE, and about six
             * are on screen. Measured 2026-08-20: none of them were lazy, so a
             * phone fetched every photograph in the grid before the visitor had
             * scrolled to any of them.
             *
             * `decoding="async"` for the same reason from the other end: the
             * main thread should not block decoding a JPEG for a card that is
             * still below the fold.
             *
             * ⚠️ NOT `priority`/eager on the first row, deliberately. These
             * cards are also the home page's rail, where the row starts off
             * screen — a rule that helps search would hurt there, and the
             * component cannot tell which page it is on.
             */
            loading="lazy"
            decoding="async"
            // The intrinsic size of the card variant we now request — see
            // photoSize.ts. Given so the browser can reserve the box before the
            // bytes arrive; the 4:3 wrapper already fixes the layout, so this is
            // belt and braces rather than the fix for a jump.
            width={960}
            height={720}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-char-500">
            {labels.noPhoto}
          </div>
        )}
        <div className="absolute left-2.5 top-2.5 flex flex-col items-start gap-1.5">
          <span className="rounded-full bg-char-900/80 px-2.5 py-1 text-xs font-semibold uppercase tracking-wider text-white backdrop-blur-sm">
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
      <div className="p-4">
        {/* Both sources shout the make and model in upper case, and both keep
            the auctions catch-all buckets in it. See formatLotTitle. */}
        <h3 className="line-clamp-1 font-bold text-char-900">{formatLotTitle(vehicle.title)}</h3>
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
        {countdownSlot && <div className="mt-1.5">{countdownSlot}</div>}
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-char-500">
          {vehicle.location?.display && (
            <span className="inline-flex items-center gap-1">
              <MapPin size={13} /> {vehicle.location.display}
            </span>
          )}
          {/* Miles with kilometres beside them: the auctions publish miles, the
              buyer thinks in kilometres. A zero or one-mile reading is printed
              rather than hidden — it is what the auction recorded, and 12,656
              searchable lots read one or the other. */}
          {odometerLabel && (
            <span className="inline-flex items-center gap-1">
              <Gauge size={13} /> {odometerLabel}
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
