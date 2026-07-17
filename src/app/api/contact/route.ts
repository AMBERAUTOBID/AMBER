import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);

  if (
    !body ||
    typeof body.name !== "string" ||
    typeof body.email !== "string" ||
    !body.name.trim() ||
    !/^\S+@\S+\.\S+$/.test(body.email)
  ) {
    return NextResponse.json(
      { ok: false, error: "Invalid submission." },
      { status: 400 }
    );
  }

  // TODO before launch: forward this to a real destination (email via
  // Resend/SES/SMTP, or a CRM webhook). Currently only logged server-side.
  console.log("[contact] new inquiry:", {
    name: body.name,
    email: body.email,
    phone: body.phone ?? "",
    vehicle: body.vehicle ?? "",
    message: body.message ?? "",
    locale: body.locale ?? "en",
    at: new Date().toISOString(),
  });

  return NextResponse.json({ ok: true });
}
