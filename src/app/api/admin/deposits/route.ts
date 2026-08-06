import { NextResponse } from "next/server";
import { UUID } from "@/shared/validation";
import { currentAdmin } from "@/modules/admin/model/currentAdmin";
import { confirmDeposit, refundDeposit } from "@/modules/plans/model/deposits";
import { sendDepositDecisionEmail } from "@/modules/plans/api/sendDepositDecisionEmail";


/**
 * Admin actions on a deposit. Authorization goes through can() like every
 * other gate — the admin page also checks, but a route that trusts the page
 * that linked to it is a route with no protection at all.
 */
export async function POST(request: Request) {
  // Same check the admin page makes, from the same function — a route that
  // trusts the page that linked to it is a route with no protection at all.
  // 404, not 403: a non-admin learns nothing about what lives here.
  const user = await currentAdmin();
  if (!user) return NextResponse.json({ ok: false }, { status: 404 });

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const depositId = typeof body?.depositId === "string" ? body.depositId : "";
  const action = body?.action;
  if (!UUID.test(depositId) || (action !== "confirm" && action !== "refund")) {
    return NextResponse.json({ ok: false, error: "invalid" }, { status: 400 });
  }

  const result =
    action === "confirm"
      ? await confirmDeposit(depositId, user.id)
      : await refundDeposit(depositId, user.id);

  if (result.status === "not_applicable") {
    // Already handled — most likely a double submit or a second admin.
    return NextResponse.json({ ok: false, error: "not_pending" }, { status: 409 });
  }

  // Only reached when the UPDATE actually claimed the row, so a double click
  // can't email the client twice about one decision. Awaited rather than
  // fired and forgotten: serverless may freeze the function the moment the
  // response is sent. It never throws.
  await sendDepositDecisionEmail(
    result.userId,
    result.planKey,
    action === "confirm" ? "confirmed" : "refunded"
  );

  return NextResponse.json({ ok: true });
}
