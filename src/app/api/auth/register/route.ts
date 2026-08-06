import { NextResponse } from "next/server";
import { registerAccount } from "@/modules/auth/model/accounts";
import { consumeLimit } from "@/modules/auth/model/rateLimit";
import { sendAuthEmail } from "@/modules/auth/api/sendAuthEmail";
import { absoluteUrl, clientIp } from "@/modules/auth/api/http";

/**
 * Registration. Responds identically whether the email was fresh or already
 * registered (existing owners get a heads-up email instead) — see
 * accounts.ts on why existence is never revealed.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ ok: false, error: "invalid" }, { status: 400 });

  if (!(await consumeLimit("registerPerIp", clientIp(request)))) {
    return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });
  }

  const locale = typeof body.locale === "string" ? body.locale : "en";
  const result = await registerAccount({
    email: typeof body.email === "string" ? body.email : "",
    password: typeof body.password === "string" ? body.password : "",
    name: typeof body.name === "string" ? body.name : "",
    phone: typeof body.phone === "string" ? body.phone : undefined,
    locale,
  });

  if (result.status === "invalid") {
    return NextResponse.json({ ok: false, error: "invalid", field: result.field }, { status: 400 });
  }

  const prefix = locale === "en" ? "" : `/${locale}`;
  if (result.status === "created") {
    await sendAuthEmail({
      to: (body.email as string).trim(),
      locale,
      kind: "verify",
      link: absoluteUrl(request, `${prefix}/verify-email?token=${result.verifyToken}`),
    }).catch((e) => console.error("[auth] verify email failed:", e));
  }

  if (result.status === "exists") {
    // The heads-up the design always promised (implemented in the 2026-08-06
    // audit — accounts.ts claimed it, nothing sent it). The owner learns
    // someone used their address — most often their own forgotten past self —
    // and gets the login link. Externally this response stays byte-identical
    // to the created path.
    await sendAuthEmail({
      to: result.existingEmail,
      locale,
      kind: "exists",
      link: absoluteUrl(request, `${prefix}/login`),
    }).catch((e) => console.error("[auth] exists email failed:", e));
  }

  return NextResponse.json({ ok: true });
}
