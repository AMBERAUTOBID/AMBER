import { NextResponse } from "next/server";
import { currentAdmin } from "@/modules/admin/model/currentAdmin";
import { addSupplierEntry } from "@/modules/orders/model/supplierLedger";
import { recordAudit } from "@/shared/db/audit";

/**
 * An admin records a supplier-balance movement.
 *
 * Amounts arrive as integer CENTS, parsed in the form where the typist can
 * see what was understood — the same contract as the money route, for the
 * same comma-becomes-a-factor-of-a-hundred reason. The financing guard runs
 * in `addSupplierEntry`; this route only translates its verdicts to HTTP.
 */
const KINDS = ["top_up", "drawdown", "adjustment"] as const;

export async function POST(request: Request) {
  const admin = await currentAdmin();
  if (!admin) return NextResponse.json({ ok: false }, { status: 404 });

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ ok: false, error: "invalid" }, { status: 400 });

  const kind = KINDS.find((k) => k === body.kind);
  const amountCents = typeof body.amountCents === "number" ? Math.round(body.amountCents) : NaN;
  const occurredAt = typeof body.occurredAt === "string" ? new Date(body.occurredAt) : null;

  if (!kind || !Number.isFinite(amountCents) || amountCents <= 0 || !occurredAt || Number.isNaN(occurredAt.getTime())) {
    return NextResponse.json({ ok: false, error: "invalid" }, { status: 400 });
  }

  const result = await addSupplierEntry({
    kind,
    amountCents,
    direction: body.direction === "credit" ? "credit" : body.direction === "debit" ? "debit" : undefined,
    orderReference: typeof body.orderReference === "string" ? body.orderReference : null,
    note: typeof body.note === "string" ? body.note : null,
    overrideReason: typeof body.overrideReason === "string" ? body.overrideReason : null,
    occurredAt,
    createdBy: admin.id,
  });

  if (result.status === "order_not_found") {
    return NextResponse.json({ ok: false, error: "order_not_found" }, { status: 404 });
  }
  if (result.status === "needs_override") {
    return NextResponse.json({ ok: false, error: "needs_override" }, { status: 409 });
  }

  await recordAudit(admin.id, "supplier.entry_added", "supplier_ledger", result.id, {
    kind,
    amountCents,
    orderReference: body.orderReference ?? null,
    financed: typeof body.overrideReason === "string" && body.overrideReason.trim() !== "",
  });

  return NextResponse.json({ ok: true, id: result.id });
}
