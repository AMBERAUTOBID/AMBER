import { NextResponse } from "next/server";
import { UUID } from "@/shared/validation";
import { currentUser } from "@/modules/auth/model/currentUser";
import { getOrderForUser } from "@/modules/orders/model/orders";
import { recordActivity } from "@/modules/activity/model/events";

/**
 * "I've paid" — the client telling us to go and look in the bank.
 *
 * ── WHY THIS EXISTS AT ALL ──────────────────────────────────────────────
 * Money sent by wire takes one to three days and arrives silently. Without
 * this the two sides are blind in both directions: an admin refreshes a bank
 * statement with no idea whether anything is coming, and a client who sent
 * $15,000 yesterday has no way to tell whether we know. Both then resolve it
 * the same way — a WhatsApp message — which is the thing the order page was
 * built to replace.
 *
 * ── WHAT IT DELIBERATELY CANNOT DO ──────────────────────────────────────
 * **It does not touch the ledger, and that is the whole safety story.** It
 * writes one activity row and nothing else. A client cannot mark their own
 * order paid, cannot change a balance, and cannot release a car; only an
 * admin recording a real row in `order_payments` does any of that. If this
 * endpoint were ever wired to money, "I've paid" would become "I say I've
 * paid, so ship it".
 *
 * Idempotent for free: `recordActivity` collapses repeats of the same
 * (user, kind, subject) inside its window, so a client hammering the button
 * bumps a counter instead of filling the admin's history with noise.
 *
 * ⚠️ **A stopgap, and built to be deleted.** When a payment provider settles
 * automatically there is nothing for a client to declare, and this route and
 * its activity kind go away together. Nothing else should come to depend on
 * it in the meantime.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: "not_found" }, { status: 404 });

  // Scoped to the owner in the query itself, not checked afterwards — and the
  // answer for "no such order" and "not yours" is the same 404, so a client
  // cannot learn that somebody else's case file exists by probing ids.
  const order = await getOrderForUser(id, user.id);
  if (!order) return NextResponse.json({ error: "not_found" }, { status: 404 });

  await recordActivity({
    userId: user.id,
    kind: "order.payment_declared",
    // The reference, not the uuid: this is read by a person who then searches
    // a bank statement for exactly this string.
    subjectKey: `order:${order.reference}`,
    label: order.reference,
  });

  return NextResponse.json({ ok: true });
}
