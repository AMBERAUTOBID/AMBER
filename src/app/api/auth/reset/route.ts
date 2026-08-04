import { NextResponse } from "next/server";
import { resetPassword } from "@/modules/auth/model/accounts";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const token = typeof body?.token === "string" ? body.token : "";
  const password = typeof body?.password === "string" ? body.password : "";
  if (!token || !password) {
    return NextResponse.json({ ok: false, error: "invalid" }, { status: 400 });
  }

  const result = await resetPassword(token, password);
  if (result === "weak_password") {
    return NextResponse.json({ ok: false, error: "weak_password" }, { status: 400 });
  }
  if (result === "invalid_or_expired") {
    return NextResponse.json({ ok: false, error: "invalid_or_expired" }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
