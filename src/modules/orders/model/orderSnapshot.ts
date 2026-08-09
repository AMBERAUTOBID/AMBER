import { normalizeTitle } from "@/modules/inventory/model";
import type { OrderStage } from "@/shared/db/schema";

/**
 * Turning a lot, as the auction describes it today, into the snapshot a case
 * file keeps forever.
 *
 * The whole reason this is a copy rather than a reference: a year after
 * delivery the lot is gone from Copart, from the mirror's active set and from
 * every vendor, but the client still owns the car and still wants to see what
 * they bought. Nothing here may depend on being able to ask again.
 *
 * Pure. The caller fetches the lot and writes the row.
 */

/** The subset of a detail response this mapper reads. Structural, so it
 * accepts an Apibara `VehicleListItem` without importing the whole type and
 * without pinning the case file to that shape forever. */
export interface LotLike {
  platform?: string | null;
  lot_number?: string | null;
  vin?: string | null;
  year?: number | null;
  make?: string | null;
  model?: string | null;
  location?: { display?: string | null } | null;
  condition?: {
    has_key?: boolean | null;
    primary_damage?: string | null;
    secondary_damage?: string | null;
  } | null;
  odometer?: { mi?: number | null; km?: number | null } | null;
  vehicle_specs?: { exterior_color?: string | null } | null;
  sale_document?: { name?: string | null } | null;
  auction?: { last_sold_day?: string | null; full_date?: string | null } | null;
}

/** Exactly the snapshot columns of `vehicle_orders`, nothing else. */
export interface OrderSnapshot {
  platform: "copart" | "iaai";
  auctionName: string | null;
  lotNumber: string;
  vin: string | null;
  year: number | null;
  make: string | null;
  model: string | null;
  color: string | null;
  odometer: number | null;
  odometerUnit: "mi" | "km" | null;
  primaryDamage: string | null;
  secondaryDamage: string | null;
  titleClass: string | null;
  docType: string | null;
  hasKeys: boolean | null;
  soldAt: Date | null;
  lotSnapshot: unknown;
}

/** The stage every case file starts in. */
export const INITIAL_STAGE: OrderStage = "won";

/**
 * Reads what a case file needs, and reports what it could not read.
 *
 * Returns null for `snapshot` only when the lot has no platform or lot number,
 * because those two are identity — a file without them cannot be looked up
 * again by anyone, including us. Everything else degrades to null: the admin
 * can fill a blank, and an invented value is a lie that outlives the person
 * who invented it.
 */
export function buildOrderSnapshot(lot: LotLike | null | undefined): OrderSnapshot | null {
  if (!lot) return null;

  const platform = lot.platform === "copart" || lot.platform === "iaai" ? lot.platform : null;
  const lotNumber = lot.lot_number?.trim();
  if (!platform || !lotNumber) return null;

  const odo = readOdometer(lot.odometer);
  const docType = lot.sale_document?.name?.trim() || null;

  return {
    platform,
    // The closest thing a list item carries to a branch name. Not the vendor's
    // `auction_name` field — that lives on the mirror, and this path reads a
    // live detail response.
    auctionName: lot.location?.display?.trim() || null,
    lotNumber,
    vin: lot.vin?.trim() || null,
    year: typeof lot.year === "number" && lot.year > 0 ? lot.year : null,
    make: lot.make?.trim() || null,
    model: lot.model?.trim() || null,
    color: lot.vehicle_specs?.exterior_color?.trim() || null,
    odometer: odo.value,
    odometerUnit: odo.unit,
    primaryDamage: lot.condition?.primary_damage?.trim() || null,
    secondaryDamage: lot.condition?.secondary_damage?.trim() || null,
    /**
     * The SAME six-bucket mapping search uses, imported rather than
     * reimplemented. A second copy would drift, and the direction it drifts in
     * matters: telling a buyer a salvage car has a clean title is the worst
     * failure available here, and `rebuildable` staying separate from
     * `salvage` changes what they may legally do with the car after import.
     */
    titleClass: normalizeTitle(docType),
    docType,
    // The vendor sends the string "no" for keys, so this is already a reading
    // rather than a fact; null genuinely means unknown, not "no keys".
    hasKeys: typeof lot.condition?.has_key === "boolean" ? lot.condition.has_key : null,
    soldAt: readDate(lot.auction?.last_sold_day) ?? readDate(lot.auction?.full_date),
    lotSnapshot: lot,
  };
}

/**
 * Which odometer figure to keep, and in which unit.
 *
 * ⚠️ **Zero is a real reading.** Nearly eight thousand lots in the mirror show
 * exactly 0 and another four and a half thousand show 1; a truthiness check
 * here would silently discard all of them and the case file would say
 * "unknown" about a number the auction stated plainly. Hence `!= null`
 * throughout.
 *
 * Miles are preferred because every US branch reports them and that is what
 * the auction's own paperwork says. Kilometres are kept rather than converted
 * when miles are absent — a converted figure is our arithmetic presented as
 * the auction's record.
 */
function readOdometer(
  odometer: LotLike["odometer"]
): { value: number | null; unit: "mi" | "km" | null } {
  const mi = odometer?.mi;
  const km = odometer?.km;
  if (typeof mi === "number" && mi >= 0) return { value: Math.round(mi), unit: "mi" };
  if (typeof km === "number" && km >= 0) return { value: Math.round(km), unit: "km" };
  return { value: null, unit: null };
}

/** A date the auction stated, or null. Never today's date as a stand-in. */
function readDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * A blank snapshot for the manual path.
 *
 * The owner asked for this explicitly (2026-08-09): sometimes the lot is old,
 * on another platform, or the car was bought outside an auction entirely, and
 * the answer must not be "the system won't let me". A file created this way
 * has no auction photos and says so; everything else an admin types.
 */
export function manualOrderSnapshot(input: {
  platform: "copart" | "iaai";
  lotNumber: string;
  vin?: string | null;
  year?: number | null;
  make?: string | null;
  model?: string | null;
}): OrderSnapshot {
  return {
    platform: input.platform,
    auctionName: null,
    lotNumber: input.lotNumber.trim(),
    vin: input.vin?.trim() || null,
    year: input.year ?? null,
    make: input.make?.trim() || null,
    model: input.model?.trim() || null,
    color: null,
    odometer: null,
    odometerUnit: null,
    primaryDamage: null,
    secondaryDamage: null,
    titleClass: null,
    docType: null,
    hasKeys: null,
    soldAt: null,
    // Null rather than `{}`: an empty object would read as "we captured the
    // lot and it was empty", which is a different and false statement.
    lotSnapshot: null,
  };
}

/** How a case file is titled wherever one line is all there is room for. */
export function orderTitle(snapshot: Pick<OrderSnapshot, "year" | "make" | "model">): string {
  const parts = [snapshot.year, snapshot.make, snapshot.model].filter(Boolean);
  // Falls back to something honest rather than an empty heading.
  return parts.length ? parts.join(" ") : "—";
}
