import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { currentAdmin } from "@/modules/admin/model/currentAdmin";
import {
  enableMaintenance,
  disableMaintenance,
} from "@/modules/admin/model/maintenance";
import { verifyPassword } from "@/modules/auth/model/password";
import { consumeLimit } from "@/modules/auth/model/rateLimit";
import { MAINTENANCE_BYPASS_COOKIE } from "@/shared/gate/maintenanceGate";
import { db, schema } from "@/shared/db/client";

/**
 * The maintenance switch. Both directions require the admin's PASSWORD, not
 * just their session: taking the whole site offline from a console tab left
 * open on an unattended machine should cost more than one click — and so
 * should bringing it back up mid-change. Same reasoning as account deletion.
 *
 * Password verification makes this an oracle for guessing it, so it shares
 * the same shaped rate limit as the other password-confirming endpoints.
 *
 * This route lives under /api/admin/, which the maintenance gate exempts —
 * otherwise enabling maintenance would lock out the only switch that
 * disables it.
 */
export async function POST(request: Request) {
  const admin = await currentAdmin();
  // 404, never 403 — a non-admin learns nothing about what lives here.
  if (!admin) return NextResponse.json({ ok: false }, { status: 404 });

  if (!(await consumeLimit("maintenanceTogglePerUser", admin.id))) {
    return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const action = body?.action;
  const password = typeof body?.password === "string" ? body.password : "";
  if ((action !== "enable" && action !== "disable") || !password) {
    return NextResponse.json({ ok: false, error: "invalid" }, { status: 400 });
  }

  const rows = await db()
    .select({ passwordHash: schema.users.passwordHash })
    .from(schema.users)
    .where(eq(schema.users.id, admin.id))
    .limit(1);
  const stored = rows[0]?.passwordHash;
  if (!stored || !(await verifyPassword(password, stored))) {
    return NextResponse.json({ ok: false, error: "invalid_password" }, { status: 403 });
  }

  if (action === "enable") {
    const { bypassToken } = await enableMaintenance(admin.id);
    const response = NextResponse.json({ ok: true, on: true });
    // The cookie that lets THIS browser keep browsing the closed site.
    // Scoped like the session cookie; 24h is longer than any sane window
    // and shorter than forgetting it exists.
    response.cookies.set(MAINTENANCE_BYPASS_COOKIE, bypassToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 24 * 60 * 60,
    });
    return response;
  }

  await disableMaintenance(admin.id);
  const response = NextResponse.json({ ok: true, on: false });
  // The window is over; the token it matched is already voided server-side.
  response.cookies.set(MAINTENANCE_BYPASS_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
  return response;
}
