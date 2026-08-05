import { NextResponse } from "next/server";
import { currentUser } from "@/modules/auth/model/currentUser";
import { updateProfile } from "@/modules/auth/model/accounts";

/** The client edits their own details. The user id comes from the session,
 * never from the body — there is no way to address someone else's row. */
export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const result = await updateProfile(user.id, {
    name: typeof body?.name === "string" ? body.name : "",
    phone: typeof body?.phone === "string" ? body.phone : "",
    locale: typeof body?.locale === "string" ? body.locale : user.locale,
  });

  if (result.status === "invalid") {
    return NextResponse.json({ ok: false, error: "invalid", field: result.field }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
