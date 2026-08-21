import { NextResponse } from "next/server";
import { UUID } from "@/shared/validation";
import { currentAdmin } from "@/modules/admin/model/currentAdmin";
import { getObjectStorage } from "@/modules/orders/api/storage";
import { issueInvoice } from "@/modules/orders/api/issueInvoice";

/**
 * An admin issues the next invoice for a case file.
 *
 * Thin on purpose: every refusal and every safety property lives in
 * `issueInvoice`, where the tests can reach it. This route only translates
 * between HTTP and that function — admin gate, uuid shape, JSON out.
 *
 * There is no PUT and no DELETE here, and none will be added: an issued
 * invoice is frozen. See `orderInvoices` in schema.ts.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await currentAdmin();
  if (!admin) return NextResponse.json({ ok: false }, { status: 404 });

  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ ok: false, error: "invalid" }, { status: 400 });

  const body = (await request.json().catch(() => null)) as { locale?: unknown } | null;
  const result = await issueInvoice({
    orderId: id,
    adminId: admin.id,
    locale: typeof body?.locale === "string" ? body.locale : undefined,
    storage: getObjectStorage(),
  });

  if (!result.ok) {
    const status = result.reason === "not_found" ? 404 : 409;
    return NextResponse.json({ ok: false, error: result.reason }, { status });
  }

  return NextResponse.json({
    ok: true,
    id: result.id,
    number: result.number,
    totalCents: result.totalCents,
    currency: result.currency,
  });
}
