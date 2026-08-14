import { NextResponse } from "next/server";
import { currentUser } from "@/modules/auth/model/currentUser";
import { requestRefund } from "@/modules/plans/model/deposits";
import { sendRefundRequestEmails } from "@/modules/plans/api/sendRefundRequestEmails";
import { consumeLimit } from "@/modules/auth/model/rateLimit";

/**
 * A client asks for their deposit back. This ends the arrangement — and it is
 * the only way out, because there is no self-service downgrade.
 *
 * **It takes no id.** The client's whole held balance moves together: after an
 * upgrade there are several confirmed rows, and they are one deposit as far as
 * the client and the bank are concerned. Accepting a row id would invite the
 * caller to pick one, which is the bug this replaced.
 *
 * Nothing moves here. The rows become `refund_requested`, the plan keeps
 * working, and an admin marking them refunded is when the money and the access
 * both go.
 */
export async function POST() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });

  // Shares the plan-request budget on purpose: request and refund are the two
  // halves of one conversation, and the thing being metered is how often one
  // account can make us email a human about their money.
  if (!(await consumeLimit("planRequestPerUser", user.id))) {
    return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });
  }

  const result = await requestRefund(user.id);
  if (result.status === "nothing_held") {
    return NextResponse.json({ ok: false, error: "nothing_held" }, { status: 409 });
  }
  if (result.status === "already_requested") {
    // Not an error worth alarming anyone with: the client pressed twice, or
    // has two tabs open. The state they wanted is the state they are in.
    return NextResponse.json({ ok: true, status: "already_requested" });
  }

  // Awaited, never fatal — the rows are already committed, and a serverless
  // function may freeze the moment the response is sent.
  await sendRefundRequestEmails({
    user,
    planKey: user.activePlanKey,
    heldCents: result.heldCents,
    cancelledPending: result.cancelledPending,
  });

  return NextResponse.json({ ok: true, status: "requested" });
}
