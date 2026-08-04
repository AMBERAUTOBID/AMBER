import { NextResponse } from "next/server";
import { requestPasswordReset } from "@/modules/auth/model/accounts";
import { consumeLimit } from "@/modules/auth/model/rateLimit";
import { sendAuthEmail } from "@/modules/auth/api/sendAuthEmail";
import { absoluteUrl } from "@/modules/auth/api/http";

/** Always answers ok — whether an email exists is never revealed here.
 * The rate limit is per target email: it protects inboxes from reset spam,
 * and its counter must not depend on whether the account exists either. */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const email = typeof body?.email === "string" ? body.email.trim() : "";
  const locale = typeof body?.locale === "string" ? body.locale : "en";
  if (!email) return NextResponse.json({ ok: false, error: "invalid" }, { status: 400 });

  if (!(await consumeLimit("resetPerEmail", email))) {
    // Also ok: a 429 here would itself reveal that prior requests happened.
    return NextResponse.json({ ok: true });
  }

  const reset = await requestPasswordReset(email);
  if (reset) {
    const prefix = locale === "en" ? "" : `/${locale}`;
    await sendAuthEmail({
      to: reset.email,
      locale,
      kind: "reset",
      link: absoluteUrl(request, `${prefix}/reset-password?token=${reset.resetToken}`),
    }).catch((e) => console.error("[auth] reset email failed:", e));
  }

  return NextResponse.json({ ok: true });
}
