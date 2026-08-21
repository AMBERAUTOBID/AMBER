import { eq } from "drizzle-orm";
import { db, schema } from "@/shared/db/client";
import type { ShippingProfileValues } from "./shippingProfileRules";

/**
 * The DB half. All rules live in `shippingProfileRules.ts` — this file only
 * moves a validated shape in and out of `shipping_profiles`.
 *
 * The split matters for the same reason as `passwordPolicy` vs `password`:
 * the client-side form imports the rules, and a client component importing
 * anything that touches `db()` takes `node:crypto` and the driver down with
 * it into the browser bundle, where they crash on contact.
 */

export async function shippingProfileFor(userId: string): Promise<ShippingProfileValues | null> {
  const rows = await db()
    .select()
    .from(schema.shippingProfiles)
    .where(eq(schema.shippingProfiles.userId, userId))
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  // The write half stores "" for a draft's absent required fields (see
  // `saveShippingProfile`). Translate back here, or completeness would count
  // an empty string as an answered question.
  const orNull = (v: string | null): string | null => (v && v.length > 0 ? v : null);

  return {
    buyerType: row.buyerType,
    buyerName: orNull(row.buyerName),
    companyCode: row.companyCode,
    vatCode: row.vatCode,
    buyerCountry: orNull(row.buyerCountry),
    buyerPhone: orNull(row.buyerPhone),
    buyerAddress: orNull(row.buyerAddress),
    destinationPort: orNull(row.destinationPort),
    receiverSame: row.receiverSame,
    receiverName: row.receiverName,
    receiverPhone: row.receiverPhone,
    receiverEmail: row.receiverEmail,
    receiverAddress: row.receiverAddress,
    receiverCountry: row.receiverCountry,
    insurance: row.insurance,
    shareContainer: row.shareContainer,
    paymentRail: row.paymentRail,
  };
}

/**
 * Upsert on the user, incomplete allowed on purpose.
 *
 * The form has six required groups and people fill things in over several
 * sittings — refusing to save until everything is present would throw away
 * twenty minutes of typing over one missing phone number. What an incomplete
 * profile cannot do is open the gate: `isShippingProfileComplete` guards the
 * bidding-code step, not the save button.
 *
 * ⚠️ The NOT NULL text columns store `""` for an absent value, translated
 * back to null on read by the rules' own `clean()` pass — Postgres NOT NULL
 * with an empty-string sentinel was chosen over nullable columns for the
 * five fields a complete profile always has, so the schema documents what
 * "done" looks like while the draft state stays saveable.
 */
export async function saveShippingProfile(
  userId: string,
  values: ShippingProfileValues
): Promise<void> {
  const row = {
    userId,
    buyerType: values.buyerType,
    buyerName: values.buyerName ?? "",
    companyCode: values.companyCode,
    vatCode: values.vatCode,
    buyerCountry: values.buyerCountry ?? "",
    buyerPhone: values.buyerPhone ?? "",
    buyerAddress: values.buyerAddress ?? "",
    destinationPort: values.destinationPort ?? "",
    receiverSame: values.receiverSame,
    receiverName: values.receiverName,
    receiverPhone: values.receiverPhone,
    receiverEmail: values.receiverEmail,
    receiverAddress: values.receiverAddress,
    receiverCountry: values.receiverCountry,
    insurance: values.insurance,
    shareContainer: values.shareContainer,
    paymentRail: values.paymentRail,
    updatedAt: new Date(),
  };

  await db()
    .insert(schema.shippingProfiles)
    .values(row)
    .onConflictDoUpdate({ target: schema.shippingProfiles.userId, set: row });
}
