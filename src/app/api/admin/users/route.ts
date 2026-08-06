import { NextResponse } from "next/server";
import { UUID } from "@/shared/validation";
import { currentAdmin } from "@/modules/admin/model/currentAdmin";
import { deleteAccount } from "@/modules/auth/model/deleteAccount";

/**
 * Admin actions on a user account. Erasure only, for now.
 *
 * It exists so a GDPR request arriving by email can be honoured without a
 * database console. The client-facing route performs the same operation;
 * `audit_log.detail.selfService` records which of the two it was.
 *
 * A `lookup` action lived here to serve the old find-by-email panel. That
 * panel became the Users table, which searches server-side through
 * `listUsers`, so the action was left with no caller and was removed —
 * an unused authenticated endpoint is surface with no upside.
 */
export async function POST(request: Request) {
  const admin = await currentAdmin();
  // 404, not 403 — a non-admin learns nothing about what lives here.
  if (!admin) return NextResponse.json({ ok: false }, { status: 404 });

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const action = body?.action;

  if (action === "delete") {
    const userId = typeof body?.userId === "string" ? body.userId : "";
    if (!UUID.test(userId)) {
      return NextResponse.json({ ok: false, error: "invalid" }, { status: 400 });
    }

    // Nothing stops an admin erasing their own account, deliberately: an
    // admin is also a person with erasure rights, and special-casing it would
    // mean the one account that cannot be erased is the one with the most
    // access. It signs them out immediately, which is the honest consequence.
    const result = await deleteAccount(userId, admin.id);
    if (result === "not_found") {
      return NextResponse.json({ ok: false, error: "not_found" }, { status: 409 });
    }
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: false, error: "invalid" }, { status: 400 });
}
