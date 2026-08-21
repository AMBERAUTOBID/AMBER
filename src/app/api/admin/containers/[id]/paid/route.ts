import { NextResponse } from "next/server";
import { UUID } from "@/shared/validation";
import { currentAdmin } from "@/modules/admin/model/currentAdmin";
import { markContainerPaid } from "@/modules/orders/model/containers";
import { recordAudit } from "@/shared/db/audit";

/** The freight money arrived — recorded once, idempotent by the WHERE. */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await currentAdmin();
  if (!admin) return NextResponse.json({ ok: false }, { status: 404 });

  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ ok: false, error: "invalid" }, { status: 400 });

  const marked = await markContainerPaid(id);
  if (marked) await recordAudit(admin.id, "container.freight_paid", "container", id);
  return NextResponse.json({ ok: marked });
}
