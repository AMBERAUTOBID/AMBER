import { NextResponse } from "next/server";
import { currentUser } from "@/modules/auth/model/currentUser";
import { saveShippingProfile } from "@/modules/account/model/shippingProfile";
import {
  normalizeShippingProfile,
  shippingProfileErrors,
  type ShippingProfileInput,
} from "@/modules/account/model/shippingProfileRules";

/**
 * The client saves their shipping profile. Same shape as the profile route:
 * the user id comes from the session, never from the body.
 *
 * An INCOMPLETE profile saves fine and returns its missing fields — people
 * fill this over several sittings, and refusing a draft over one absent
 * phone number throws away twenty minutes of typing. `complete` in the
 * response is what the form uses to flip its status strip; the server-side
 * gate reads the same rule from the database when it matters.
 */
export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ ok: false, error: "invalid" }, { status: 400 });

  const str = (key: string): string => (typeof body[key] === "string" ? (body[key] as string) : "");
  const bool = (key: string, fallback: boolean): boolean =>
    typeof body[key] === "boolean" ? (body[key] as boolean) : fallback;

  const input: ShippingProfileInput = {
    buyerType: str("buyerType"),
    buyerName: str("buyerName"),
    companyCode: str("companyCode"),
    vatCode: str("vatCode"),
    buyerCountry: str("buyerCountry"),
    buyerPhone: str("buyerPhone"),
    buyerAddress: str("buyerAddress"),
    destinationPort: str("destinationPort"),
    receiverSame: bool("receiverSame", true),
    receiverName: str("receiverName"),
    receiverPhone: str("receiverPhone"),
    receiverEmail: str("receiverEmail"),
    receiverAddress: str("receiverAddress"),
    receiverCountry: str("receiverCountry"),
    insurance: bool("insurance", true),
    shareContainer: bool("shareContainer", true),
    paymentRail: str("paymentRail"),
  };

  const values = normalizeShippingProfile(input);
  await saveShippingProfile(user.id, values);

  const missing = shippingProfileErrors(values);
  return NextResponse.json({ ok: true, complete: missing.length === 0, missing });
}
