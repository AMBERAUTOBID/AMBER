import { NextResponse } from "next/server";
import { UUID } from "@/shared/validation";
import { currentAdmin } from "@/modules/admin/model/currentAdmin";
import {
  confirmDeposit,
  declineRefundRequest,
  refundClient,
  setPlanByAdmin,
} from "@/modules/plans/model/deposits";
import { isPlanKey } from "@/modules/plans/model/plans";
import { sendDepositDecisionEmail } from "@/modules/plans/api/sendDepositDecisionEmail";

/**
 * Every admin action on a client's money or tier.
 *
 * **Two different subjects, and the distinction is load-bearing.** `confirm`
 * acts on one deposit row, because a queue entry *is* a row. Everything else
 * acts on a **client**: a refund, a declined refund and a plan override all
 * concern the whole held balance, which after an upgrade spans several rows.
 * Taking a row id for those would let the caller act on one row and leave the
 * others — precisely the gap that used to strip a plan while still reporting
 * money as held.
 */
type Action = "confirm" | "refund" | "decline_refund" | "set_plan";

const CLIENT_ACTIONS: Action[] = ["refund", "decline_refund", "set_plan"];

export async function POST(request: Request) {
  // Same check the admin page makes, from the same function — a route that
  // trusts the page that linked to it is a route with no protection at all.
  // 404, not 403: a non-admin learns nothing about what lives here.
  const user = await currentAdmin();
  if (!user) return NextResponse.json({ ok: false }, { status: 404 });

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const action = body?.action as Action;
  if (action !== "confirm" && !CLIENT_ACTIONS.includes(action)) {
    return NextResponse.json({ ok: false, error: "invalid" }, { status: 400 });
  }

  if (action === "confirm") {
    const depositId = typeof body?.depositId === "string" ? body.depositId : "";
    if (!UUID.test(depositId)) {
      return NextResponse.json({ ok: false, error: "invalid" }, { status: 400 });
    }
    const result = await confirmDeposit(depositId, user.id);
    if (result.status === "not_applicable") {
      // Already handled — most likely a double submit or a second admin.
      return NextResponse.json({ ok: false, error: "not_pending" }, { status: 409 });
    }
    await sendDepositDecisionEmail(result.userId, result.planKey, "confirmed");
    return NextResponse.json({ ok: true });
  }

  const userId = typeof body?.userId === "string" ? body.userId : "";
  if (!UUID.test(userId)) {
    return NextResponse.json({ ok: false, error: "invalid" }, { status: 400 });
  }

  if (action === "refund") {
    const result = await refundClient(userId, user.id);
    if (result.status === "not_applicable") {
      return NextResponse.json({ ok: false, error: "not_pending" }, { status: 409 });
    }
    // Only reached when the UPDATE actually claimed rows, so a double click
    // can't email the client twice about one decision. Awaited rather than
    // fired and forgotten: serverless may freeze the function the moment the
    // response is sent. It never throws.
    await sendDepositDecisionEmail(result.userId, result.planKey, "refunded");
    return NextResponse.json({ ok: true });
  }

  if (action === "decline_refund") {
    const result = await declineRefundRequest(userId, user.id);
    if (result.status === "not_applicable") {
      return NextResponse.json({ ok: false, error: "not_pending" }, { status: 409 });
    }
    // Deliberately silent to the client. Declining restores exactly the state
    // they were in before they asked, and it only ever happens because they
    // asked us to — an email announcing it would be the software telling
    // somebody the outcome of their own phone call.
    return NextResponse.json({ ok: true });
  }

  // set_plan — an override. No money moves; see setPlanByAdmin.
  const raw = body?.planKey;
  // Null is a real choice here, not a missing field: it takes the client off
  // every tier without touching their deposit.
  const planKey = raw === null ? null : typeof raw === "string" && isPlanKey(raw) ? raw : undefined;
  if (planKey === undefined) {
    return NextResponse.json({ ok: false, error: "unknown_plan" }, { status: 400 });
  }

  const result = await setPlanByAdmin(userId, planKey, user.id);
  if (result.status === "not_applicable") {
    // Covers "already on that tier", "no such account" and "erased" as one
    // answer: nothing changed, and the screen should reload to find out why.
    return NextResponse.json({ ok: false, error: "not_pending" }, { status: 409 });
  }

  // Nothing else would tell them. There is no transfer, no bank line and no
  // request of their own behind this change — only an email.
  await sendDepositDecisionEmail(
    result.userId,
    result.planKey ?? "",
    result.planKey ? "changed" : "removed"
  );
  return NextResponse.json({ ok: true });
}
