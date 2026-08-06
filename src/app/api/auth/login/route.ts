import { NextResponse } from "next/server";
import { loginAccount } from "@/modules/auth/model/accounts";
import { consumeLimit } from "@/modules/auth/model/rateLimit";
import { clientContext, clientIp, setSessionCookie } from "@/modules/auth/api/http";
import { issueBypassForAdminLogin } from "@/modules/admin/model/maintenance";
import { MAINTENANCE_BYPASS_COOKIE } from "@/shared/gate/maintenanceGate";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const email = typeof body?.email === "string" ? body.email : "";
  const password = typeof body?.password === "string" ? body.password : "";
  if (!email || !password) {
    return NextResponse.json({ ok: false, error: "invalid" }, { status: 400 });
  }

  // Both dimensions, deliberately: perIp catches one machine spraying many
  // accounts, perEmail catches a botnet converging on one account.
  const [ipOk, emailOk] = await Promise.all([
    consumeLimit("loginPerIp", clientIp(request)),
    consumeLimit("loginPerEmail", email),
  ]);
  if (!ipOk || !emailOk) {
    return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });
  }

  const result = await loginAccount(email, password, clientContext(request));

  if (result.status === "invalid_credentials") {
    // 401 with one undifferentiated error — accounts.ts guarantees the
    // timing matches too.
    return NextResponse.json({ ok: false, error: "invalid_credentials" }, { status: 401 });
  }
  if (result.status === "email_not_verified") {
    return NextResponse.json({ ok: false, error: "email_not_verified" }, { status: 403 });
  }

  const response = NextResponse.json({ ok: true });
  setSessionCookie(response, result.sessionToken, result.expiresAt);

  // The "turn the site back on from my phone" path: an ADMIN signing in
  // while maintenance is up also gets the bypass cookie, so the login
  // (which the gate exempts) leads to a browsable site instead of the
  // closed sign. No-op for clients and whenever the site is open.
  if (result.role === "admin") {
    const bypassToken = await issueBypassForAdminLogin(result.userId);
    if (bypassToken) {
      response.cookies.set(MAINTENANCE_BYPASS_COOKIE, bypassToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 24 * 60 * 60,
      });
    }
  }

  return response;
}
