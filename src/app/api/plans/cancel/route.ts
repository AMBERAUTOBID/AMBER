import { NextResponse } from "next/server";
import { UUID } from "@/shared/validation";
import { currentUser } from "@/modules/auth/model/currentUser";
import { cancelPlanRequest } from "@/modules/plans/model/deposits";

/**
 * A client withdraws their own pending plan request.
 *
 * The ownership check is not here — it is the `userId` in cancelPlanRequest's
 * WHERE clause. Doing it in SQL rather than as a read-then-write in this
 * handler is what makes it airtight: there is no window between checking who
 * owns the row and updating it, and a `depositId` belonging to someone else
 * simply matches nothing.
 */

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as { depositId?: unknown } | null;
  const depositId = typeof body?.depositId === "string" ? body.depositId : "";
  if (!UUID.test(depositId)) {
    return NextResponse.json({ ok: false, error: "invalid" }, { status: 400 });
  }

  const result = await cancelPlanRequest(depositId, user.id);
  if (result === "not_pending") {
    // Covers all three of: already decided, already cancelled, and not
    // theirs. Deliberately one answer — distinguishing them would tell a
    // caller whether a deposit id they guessed exists.
    return NextResponse.json({ ok: false, error: "not_pending" }, { status: 409 });
  }
  return NextResponse.json({ ok: true });
}
