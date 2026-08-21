import { NextResponse } from "next/server";
import { UUID } from "@/shared/validation";
import { currentAdmin } from "@/modules/admin/model/currentAdmin";
import { previewInvoice } from "@/modules/orders/api/issueInvoice";

/**
 * The watermarked draft, opened in a browser tab before the real button is
 * pressed. GET, because it is a read: no number is allocated, nothing is
 * stored, and refreshing the tab costs nothing but a render.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await currentAdmin();
  if (!admin) return NextResponse.json({ ok: false }, { status: 404 });

  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ ok: false, error: "invalid" }, { status: 400 });

  const locale = new URL(request.url).searchParams.get("locale") ?? undefined;
  const result = await previewInvoice({ orderId: id, locale });

  if (!result.ok) {
    // Plain text, because this lands in a browser tab an admin just opened —
    // a naked JSON object reads worse than the reason itself.
    return new NextResponse(result.reason, {
      status: result.reason === "not_found" ? 404 : 409,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  return new NextResponse(Buffer.from(result.pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="draft-${result.reference}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
