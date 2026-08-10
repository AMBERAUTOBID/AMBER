import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/shared/db/client";
import { UUID } from "@/shared/validation";
import { currentAdmin } from "@/modules/admin/model/currentAdmin";
import { getOrder } from "@/modules/orders/model/orders";

/**
 * The order's own fields: the title, the consignee, the shipping references
 * and the internal note.
 *
 * These are facts about the file rather than events on it, which is why they
 * live here and not on the stage route. A container number is not something
 * that happens on a date; it is something that becomes known.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await currentAdmin();
  if (!admin) return NextResponse.json({ ok: false }, { status: 404 });

  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ ok: false, error: "invalid" }, { status: 400 });

  const order = await getOrder(id);
  if (!order) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;

  switch (body?.action) {
    case "titleReceived":
      return titleReceived(id, body);
    case "consignee":
      return consignee(id, body);
    case "shipping":
      return shipping(id, body);
    case "internalNote":
      return internalNote(id, body);
    default:
      return NextResponse.json({ ok: false, error: "invalid" }, { status: 400 });
  }
}

/** Trimmed, capped, and empty means null rather than an empty string. */
function text(value: unknown, max = 200): string | null {
  return typeof value === "string" ? value.trim().slice(0, max) || null : null;
}

/**
 * Records that the physical title arrived, or takes it back.
 *
 * Reversible on purpose. "Title received" gets ticked from a courier
 * notification and then the envelope turns out to hold the wrong car's
 * paperwork — which happens — and an irreversible flag would mean the file
 * says the export is unblocked when it is not.
 */
async function titleReceived(orderId: string, body: Record<string, unknown>) {
  let receivedAt: Date | null = null;

  if (body.receivedAt !== null && body.receivedAt !== undefined) {
    if (typeof body.receivedAt !== "string") {
      return NextResponse.json({ ok: false, error: "invalid" }, { status: 400 });
    }
    receivedAt = new Date(body.receivedAt);
    if (Number.isNaN(receivedAt.getTime())) {
      return NextResponse.json({ ok: false, error: "invalid_date" }, { status: 400 });
    }
  }

  await db()
    .update(schema.vehicleOrders)
    .set({ titleReceivedAt: receivedAt, updatedAt: new Date() })
    .where(eq(schema.vehicleOrders.id, orderId));

  return NextResponse.json({ ok: true, titleReceivedAt: receivedAt?.toISOString() ?? null });
}

/**
 * Who takes delivery at the far end.
 *
 * Every field is optional, including the name. A file often knows the country
 * long before it knows who is collecting, and refusing a partial save would
 * push the half-known answer back into WhatsApp — which is the problem this
 * is here to solve.
 *
 * ⚠️ No personal or company code is accepted, and that is not an oversight.
 * Those identifiers are ruled out for now (ARCHITECTURE.md §6a, alongside
 * IBAN); accepting one here would collect it through a side door.
 */
async function consignee(orderId: string, body: Record<string, unknown>) {
  await db()
    .update(schema.vehicleOrders)
    .set({
      consigneeName: text(body.name, 120),
      consigneeCompany: text(body.company, 120),
      consigneePhone: text(body.phone, 40),
      consigneeEmail: text(body.email, 120),
      // Generous: this is a multi-line block copied onto a bill of lading.
      consigneeAddress: text(body.address, 500),
      consigneeCountry: text(body.country, 80),
      updatedAt: new Date(),
    })
    .where(eq(schema.vehicleOrders.id, orderId));

  return NextResponse.json({ ok: true });
}

async function shipping(orderId: string, body: Record<string, unknown>) {
  let etaAt: Date | null = null;
  if (typeof body.etaAt === "string" && body.etaAt) {
    etaAt = new Date(body.etaAt);
    if (Number.isNaN(etaAt.getTime())) {
      return NextResponse.json({ ok: false, error: "invalid_date" }, { status: 400 });
    }
  }

  await db()
    .update(schema.vehicleOrders)
    .set({
      containerNumber: text(body.containerNumber, 40),
      billOfLading: text(body.billOfLading, 60),
      vesselName: text(body.vesselName, 120),
      departurePort: text(body.departurePort, 120),
      destinationPort: text(body.destinationPort, 120),
      etaAt,
      updatedAt: new Date(),
    })
    .where(eq(schema.vehicleOrders.id, orderId));

  return NextResponse.json({ ok: true });
}

/** Never reaches the client, at any stage. */
async function internalNote(orderId: string, body: Record<string, unknown>) {
  await db()
    .update(schema.vehicleOrders)
    .set({ internalNote: text(body.note, 4000), updatedAt: new Date() })
    .where(eq(schema.vehicleOrders.id, orderId));

  return NextResponse.json({ ok: true });
}
