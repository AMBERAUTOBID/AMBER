import { NextResponse } from "next/server";
import { currentAdmin } from "@/modules/admin/model/currentAdmin";
import { createContainer } from "@/modules/orders/model/containers";
import { recordAudit } from "@/shared/db/audit";
import { UUID } from "@/shared/validation";

/** An admin creates a dedicated container from a client's case files. */
export async function POST(request: Request) {
  const admin = await currentAdmin();
  if (!admin) return NextResponse.json({ ok: false }, { status: 404 });

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ ok: false, error: "invalid" }, { status: 400 });

  const orderIds = Array.isArray(body.orderIds)
    ? body.orderIds.filter((id): id is string => typeof id === "string" && UUID.test(id))
    : [];
  const freightCents =
    typeof body.freightCents === "number" ? Math.round(body.freightCents) : NaN;
  const dueAt = typeof body.dueAt === "string" ? new Date(body.dueAt) : null;
  const containerType =
    typeof body.containerType === "string" && body.containerType.trim()
      ? body.containerType.trim().slice(0, 20)
      : "40ft";

  if (
    orderIds.length === 0 ||
    !Number.isFinite(freightCents) ||
    freightCents <= 0 ||
    !dueAt ||
    Number.isNaN(dueAt.getTime())
  ) {
    return NextResponse.json({ ok: false, error: "invalid" }, { status: 400 });
  }

  const result = await createContainer({
    orderIds,
    freightCents,
    dueAt,
    containerType,
    note: typeof body.note === "string" ? body.note.trim() || null : null,
    createdBy: admin.id,
  });

  if (result.status !== "ok") {
    return NextResponse.json({ ok: false, error: result.status }, { status: 409 });
  }

  await recordAudit(admin.id, "container.created", "container", result.id, {
    reference: result.reference,
    freightCents,
    orders: orderIds.length,
  });
  return NextResponse.json({ ok: true, id: result.id, reference: result.reference });
}
