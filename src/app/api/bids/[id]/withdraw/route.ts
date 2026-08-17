import { NextResponse } from "next/server";
import { UUID } from "@/shared/validation";
import { currentUser } from "@/modules/auth/model/currentUser";
import { withdrawBidRequest } from "@/modules/bids/model/bidRequests";

/**
 * A client takes back their own bid instruction.
 *
 * **Every rule that matters is re-applied in `withdrawBidRequest`, not here.**
 * The page that drew the button checked the clock when it rendered, which may
 * have been an hour ago — and an hour is the difference between a safe
 * withdrawal and one taken while somebody is at the auction screen. So this
 * route carries no timing logic of its own to drift out of step with the
 * model's.
 *
 * 409 rather than 400 for a refusal: nothing about the request was malformed,
 * the instruction has simply moved on. The page says so in those words and
 * offers the phone, because at that point a person can still find out whether
 * a bid is live and a form cannot.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

  const result = await withdrawBidRequest(id, user.id);

  if (result.status === "not_found") {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }
  if (result.status === "too_late") {
    return NextResponse.json({ ok: false, error: "too_late" }, { status: 409 });
  }

  return NextResponse.json({ ok: true });
}
