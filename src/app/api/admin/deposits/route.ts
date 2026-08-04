import { NextResponse } from "next/server";
import { currentUser } from "@/modules/auth/model/currentUser";
import { can } from "@/modules/plans/model/can";
import { confirmDeposit, refundDeposit } from "@/modules/plans/model/deposits";
import type { PlanKey } from "@/modules/plans/model/plans";

/**
 * Admin actions on a deposit. Authorization goes through can() like every
 * other gate — the admin page also checks, but a route that trusts the page
 * that linked to it is a route with no protection at all.
 */
export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });

  const decision = can(
    {
      role: user.role,
      emailVerified: user.emailVerified,
      activePlanKey: user.activePlanKey as PlanKey | null,
      selfBiddingGranted: user.selfBiddingGranted,
    },
    { type: "access_admin" }
  );
  // 404, not 403: a non-admin learns nothing about what lives here.
  if (!decision.allowed) return NextResponse.json({ ok: false }, { status: 404 });

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const depositId = typeof body?.depositId === "string" ? body.depositId : "";
  const action = body?.action;
  if (!depositId || (action !== "confirm" && action !== "refund")) {
    return NextResponse.json({ ok: false, error: "invalid" }, { status: 400 });
  }

  const result =
    action === "confirm"
      ? await confirmDeposit(depositId, user.id)
      : await refundDeposit(depositId, user.id);

  if (result === "not_pending") {
    // Already handled — most likely a double submit or a second admin.
    return NextResponse.json({ ok: false, error: "not_pending" }, { status: 409 });
  }
  return NextResponse.json({ ok: true });
}
