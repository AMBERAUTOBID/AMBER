// Relative, not `@/` — same rule as costEstimate's own import of plans: this
// keeps the pure layer importable from plain `tsx` scripts outside Next.
import { PORT_MULTIPLIER } from "../../pricing/model/costEstimate";

/**
 * The pure rules for the shipping profile: what a submission looks like, how
 * it is normalised, and when it counts as complete.
 *
 * Split from the DB half (`shippingProfile.ts`) the same way `passwordPolicy`
 * split from `password`: this file has zero imports that a client component
 * or a test cannot swallow, so the form can validate as the user types with
 * exactly the rules the server will apply — one spelling of the truth.
 *
 * ── WHY "COMPLETE" IS A REAL STATE, NOT DECORATION ──────────────────────
 * The bidding code is issued by hand, by the owner, after this profile is
 * complete — because an incomplete profile discovered at 23:40 after a win
 * is a shipping order that cannot be submitted while Copart's storage clock
 * runs. `isComplete` is what the account page's gate and the admin's user
 * page both read, so the two can never disagree about whether a client is
 * ready to bid.
 */

/** The same three ports the cost calculator prices — one list, one meaning.
 * `as const`-like readonly view derived at module load, not retyped. */
export const SHIPPING_PORTS = Object.keys(PORT_MULTIPLIER);

export type BuyerType = "person" | "company";
export type PaymentRail = "wise" | "bank";

/** What the form submits. Everything optional-ish: normalisation decides. */
export interface ShippingProfileInput {
  buyerType: string;
  buyerName: string;
  companyCode: string;
  vatCode: string;
  buyerCountry: string;
  buyerPhone: string;
  buyerAddress: string;
  destinationPort: string;
  receiverSame: boolean;
  receiverName: string;
  receiverPhone: string;
  receiverEmail: string;
  receiverAddress: string;
  receiverCountry: string;
  insurance: boolean;
  shareContainer: boolean;
  paymentRail: string;
}

/** The normalised shape both the DB row and the form state share. */
export interface ShippingProfileValues {
  buyerType: BuyerType;
  buyerName: string | null;
  companyCode: string | null;
  vatCode: string | null;
  buyerCountry: string | null;
  buyerPhone: string | null;
  buyerAddress: string | null;
  destinationPort: string | null;
  receiverSame: boolean;
  receiverName: string | null;
  receiverPhone: string | null;
  receiverEmail: string | null;
  receiverAddress: string | null;
  receiverCountry: string | null;
  insurance: boolean;
  shareContainer: boolean;
  paymentRail: PaymentRail | null;
}

/**
 * Ceilings, not formats. A Lithuanian phone, an Emirati one and a company
 * switchboard with an extension are all valid strings; guessing a stricter
 * pattern rejects real people. What the caps actually defend against is
 * somebody storing a novel in a column that ends up on a bill of lading.
 */
const MAX = {
  name: 200,
  code: 64,
  phone: 40,
  email: 254,
  country: 80,
  address: 500,
} as const;

function clean(value: string | null | undefined, max: number): string | null {
  const v = (value ?? "").trim();
  if (!v) return null;
  return v.length > max ? v.slice(0, max) : v;
}

/**
 * Whatever arrives becomes a well-formed `ShippingProfileValues`.
 *
 * Unknown enum strings fold to their defaults rather than throwing: this runs
 * on a request body, and a hand-crafted `buyerType: "admin"` should become
 * "person", not a 500. When the receiver is "same as me", the receiver fields
 * are nulled HERE, not in the UI — otherwise hidden stale values ride along
 * and reappear the day someone toggles the switch.
 */
export function normalizeShippingProfile(input: ShippingProfileInput): ShippingProfileValues {
  const buyerType: BuyerType = input.buyerType === "company" ? "company" : "person";
  const receiverSame = Boolean(input.receiverSame);
  const rail: PaymentRail | null =
    input.paymentRail === "wise" ? "wise" : input.paymentRail === "bank" ? "bank" : null;
  const port = SHIPPING_PORTS.includes(input.destinationPort) ? input.destinationPort : null;

  return {
    buyerType,
    buyerName: clean(input.buyerName, MAX.name),
    // Company identifiers make no claim about a private person.
    companyCode: buyerType === "company" ? clean(input.companyCode, MAX.code) : null,
    vatCode: buyerType === "company" ? clean(input.vatCode, MAX.code) : null,
    buyerCountry: clean(input.buyerCountry, MAX.country),
    buyerPhone: clean(input.buyerPhone, MAX.phone),
    buyerAddress: clean(input.buyerAddress, MAX.address),
    destinationPort: port,
    receiverSame,
    receiverName: receiverSame ? null : clean(input.receiverName, MAX.name),
    receiverPhone: receiverSame ? null : clean(input.receiverPhone, MAX.phone),
    receiverEmail: receiverSame ? null : clean(input.receiverEmail, MAX.email),
    receiverAddress: receiverSame ? null : clean(input.receiverAddress, MAX.address),
    receiverCountry: receiverSame ? null : clean(input.receiverCountry, MAX.country),
    insurance: Boolean(input.insurance),
    shareContainer: Boolean(input.shareContainer),
    paymentRail: rail,
  };
}

/**
 * Field keys with a message key each — the shape `next-intl` consumes
 * directly, so the API can return them and the form can render them without a
 * translation table in between.
 */
export type ShippingProfileError =
  | "buyerName"
  | "companyCode"
  | "buyerCountry"
  | "buyerPhone"
  | "buyerAddress"
  | "destinationPort"
  | "receiverName"
  | "receiverPhone"
  | "receiverAddress"
  | "receiverCountry"
  | "paymentRail";

/**
 * What "ready to receive a car" requires. Notably NOT required: VAT code
 * (plenty of small companies have none), receiver email (phone reaches a
 * terminal worker; email is a bonus), and anything about identity documents
 * — see the schema comment for why those are deliberately absent.
 */
export function shippingProfileErrors(v: ShippingProfileValues): ShippingProfileError[] {
  const errors: ShippingProfileError[] = [];

  if (!v.buyerName) errors.push("buyerName");
  if (v.buyerType === "company" && !v.companyCode) errors.push("companyCode");
  if (!v.buyerCountry) errors.push("buyerCountry");
  if (!v.buyerPhone) errors.push("buyerPhone");
  if (!v.buyerAddress) errors.push("buyerAddress");
  if (!v.destinationPort) errors.push("destinationPort");

  if (!v.receiverSame) {
    if (!v.receiverName) errors.push("receiverName");
    if (!v.receiverPhone) errors.push("receiverPhone");
    if (!v.receiverAddress) errors.push("receiverAddress");
    if (!v.receiverCountry) errors.push("receiverCountry");
  }

  if (!v.paymentRail) errors.push("paymentRail");

  return errors;
}

export function isShippingProfileComplete(v: ShippingProfileValues): boolean {
  return shippingProfileErrors(v).length === 0;
}

/** An empty form for a user who has never saved one. The defaults mirror the
 * schema's: insurance on, shared container on, rail deliberately unchosen. */
export function emptyShippingProfile(): ShippingProfileValues {
  return {
    buyerType: "person",
    buyerName: null,
    companyCode: null,
    vatCode: null,
    buyerCountry: null,
    buyerPhone: null,
    buyerAddress: null,
    destinationPort: null,
    receiverSame: true,
    receiverName: null,
    receiverPhone: null,
    receiverEmail: null,
    receiverAddress: null,
    receiverCountry: null,
    insurance: true,
    shareContainer: true,
    paymentRail: null,
  };
}
