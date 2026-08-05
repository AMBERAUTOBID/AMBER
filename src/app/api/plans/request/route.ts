import { NextResponse } from "next/server";
import { currentUser } from "@/modules/auth/model/currentUser";
import { isPlanKey } from "@/modules/plans/model/plans";
import { requestPlan } from "@/modules/plans/model/deposits";

/**
 * A signed-in client asks to take a plan. This creates a pending deposit —
 * it grants nothing. Only an admin confirming the transfer activates a plan.
 */
export async function POST(request: Request) {
  const user = await currentUser();
  // Server-side check. The plans page hides the button for signed-out
  // visitors; that is presentation, this is the boundary.
  if (!user) return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });
  if (!user.emailVerified) {
    return NextResponse.json({ ok: false, error: "email_not_verified" }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as { planKey?: unknown } | null;
  const planKey = typeof body?.planKey === "string" ? body.planKey : "";
  if (!isPlanKey(planKey)) {
    return NextResponse.json({ ok: false, error: "unknown_plan" }, { status: 400 });
  }

  const result = await requestPlan(user.id, planKey);
  if (result.status === "unavailable") {
    return NextResponse.json({ ok: false, error: "plan_unavailable" }, { status: 409 });
  }
  return NextResponse.json({ ok: true, status: result.status });
}
