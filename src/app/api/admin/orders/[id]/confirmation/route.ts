import { NextResponse } from "next/server";
import { UUID } from "@/shared/validation";
import { currentAdmin } from "@/modules/admin/model/currentAdmin";
import { getOrder } from "@/modules/orders/model/orders";
import { recordActivity } from "@/modules/activity/model/events";
import { recordAudit } from "@/shared/db/audit";

/**
 * "The bank confirmation arrived" — recorded by the ADMIN.
 *
 * The client's own DeclarePaymentButton writes this signal when they press
 * it on the site. But the owner's flow mirrors Aivi's: first-timers email
 * their bank's confirmation to billing@smartautobid.com — and an email in an
 * inbox is invisible to `drawdownFactsFor`, which decides whether the
 * auction may be paid. This route lets the admin who READ that email flip
 * the same switch the client's button flips: the identical activity row,
 * so the financing gate has exactly one thing to look at.
 *
 * Written against the ORDER OWNER's user id, not the admin's — the queue
 * matches declarations on reference, and the activity belongs to the case,
 * but attribution of who recorded it lives in the audit log entry below.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await currentAdmin();
  if (!admin) return NextResponse.json({ ok: false }, { status: 404 });

  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ ok: false, error: "invalid" }, { status: 400 });

  const order = await getOrder(id);
  if (!order) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

  await recordActivity({
    userId: order.userId,
    kind: "order.payment_declared",
    subjectKey: `order:${order.reference}`,
    label: order.reference,
  });
  await recordAudit(admin.id, "order.confirmation_recorded", "order", id, {
    reference: order.reference,
  });

  return NextResponse.json({ ok: true });
}
