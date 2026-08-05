import { NextResponse } from "next/server";
import { currentUser } from "@/modules/auth/model/currentUser";
import { PLANS, isPlanKey } from "@/modules/plans/model/plans";
import { requestPlan } from "@/modules/plans/model/deposits";
import { sendPlanRequestEmails } from "@/modules/plans/api/sendPlanRequestEmails";

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

  const body = (await request.json().catch(() => null)) as {
    planKey?: unknown;
    acceptedTerms?: unknown;
  } | null;
  const planKey = typeof body?.planKey === "string" ? body.planKey : "";
  if (!isPlanKey(planKey)) {
    return NextResponse.json({ ok: false, error: "unknown_plan" }, { status: 400 });
  }

  const acceptedTerms = body?.acceptedTerms === true;
  const result = await requestPlan(user.id, planKey, acceptedTerms);
  if (result.status === "unavailable") {
    return NextResponse.json({ ok: false, error: "plan_unavailable" }, { status: 409 });
  }

  // Only on a genuinely new request. "already_pending" means we notified
  // everyone the first time, and a double-submitted dialog must not mail the
  // admin twice about one request.
  //
  // Awaited rather than fired and forgotten: this runs on a serverless
  // platform that may freeze the function the moment the response is sent, so
  // a dangling promise is a notification that silently never happens. The
  // helper never throws, so a mail outage still returns ok — the request is
  // already committed and is the thing the client cares about.
  if (result.status === "requested") {
    await sendPlanRequestEmails({ user, plan: PLANS[planKey], acceptedTerms });
  }

  return NextResponse.json({ ok: true, status: result.status });
}
