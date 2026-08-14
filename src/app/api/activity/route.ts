import { NextResponse } from "next/server";
import { currentUser } from "@/modules/auth/model/currentUser";
import { consumeLimit } from "@/modules/auth/model/rateLimit";
import { labelFromHistory, recordActivity } from "@/modules/activity/model/events";
import { lotSubjectKey } from "@/modules/activity/model/subjects";
import { PORT_KEYS, isClientRecordable } from "@/modules/activity/model/clientEvents";

/**
 * The two signals only the browser can see: costing a lot to a port, and
 * clicking through to the auction's own listing. Neither is a page load, so
 * neither can be recorded server-side the way `lot.viewed` is.
 *
 * **Three rules, because this is the one endpoint where the client speaks.**
 *
 * 1. **A short allowlist, not the whole enum.** `lot.viewed` is deliberately
 *    NOT client-recordable: it is written by the page from a server-side
 *    fetch, and accepting it here would let anyone stuff their own file with
 *    cars they never opened — making the honest rows worthless.
 * 2. **The label is never taken from the request.** It is copied from the
 *    client's own `lot.viewed` row, written earlier by the server. See
 *    `labelFromHistory`. Same rule as `deposits.amountCents`.
 * 3. **Metered.** A calculator that fires on every keystroke, or a script,
 *    must not be able to write unboundedly. The collapse window keeps the
 *    *rows* down; this keeps the *writes* down.
 *
 * Answers 204 to everything it accepts, including things it quietly declines.
 * There is nothing for the page to do with the outcome, and a body inviting
 * the caller to distinguish "recorded" from "ignored" would be a probe.
 */
export async function POST(request: Request) {
  const user = await currentUser();
  // 204 rather than 401: a signed-out visitor firing this is normal (they
  // clicked the same button), not an error worth reporting to the console.
  if (!user) return new NextResponse(null, { status: 204 });

  if (!(await consumeLimit("activityPerUser", user.id))) {
    return new NextResponse(null, { status: 204 });
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const kind = typeof body?.kind === "string" ? body.kind : "";
  if (!isClientRecordable(kind)) {
    // 400 here, not 204: an unknown kind is a caller bug or a probe, and both
    // are worth being unambiguous about. It leaks nothing — the allowlist is
    // in the client bundle already.
    return NextResponse.json({ ok: false, error: "unknown_kind" }, { status: 400 });
  }

  const platform = typeof body?.platform === "string" ? body.platform : "";
  const lotNumber = typeof body?.lot === "string" ? body.lot : "";
  if (!/^(copart|iaai)$/i.test(platform) || !lotNumber || !/^[A-Za-z0-9-]{1,32}$/.test(lotNumber)) {
    return NextResponse.json({ ok: false, error: "invalid" }, { status: 400 });
  }

  const subjectKey = lotSubjectKey(platform, lotNumber);
  const known = await labelFromHistory(user.id, subjectKey);
  // No prior row means we have never served this person that lot, so we have
  // no vetted name for it. The bare reference is the honest fallback — never
  // a name the caller supplied.
  const label = known ?? `${platform.toUpperCase()} ${lotNumber}`;

  const detail: Record<string, unknown> = { lot: lotNumber, platform: platform.toLowerCase() };
  if (kind === "lot.cost_calculated") {
    // The port is the whole point of this event — "costed to Klaipėda" says
    // far more than "used the calculator". Validated against the known list
    // so the history can't be seeded with arbitrary strings.
    const port = typeof body?.port === "string" ? body.port : "";
    if (!PORT_KEYS.includes(port)) {
      return NextResponse.json({ ok: false, error: "invalid" }, { status: 400 });
    }
    detail.port = port;
  }

  await recordActivity({ userId: user.id, kind, subjectKey, label, detail });
  return new NextResponse(null, { status: 204 });
}
