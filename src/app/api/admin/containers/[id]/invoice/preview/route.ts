import { NextResponse } from "next/server";
import { UUID } from "@/shared/validation";
import { currentAdmin } from "@/modules/admin/model/currentAdmin";
import { previewContainerInvoice } from "@/modules/orders/api/issueContainerInvoice";

/** The freight draft — see the order-invoice preview route for the shape. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await currentAdmin();
  if (!admin) return NextResponse.json({ ok: false }, { status: 404 });

  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ ok: false, error: "invalid" }, { status: 400 });

  const locale = new URL(request.url).searchParams.get("locale") ?? undefined;
  const result = await previewContainerInvoice({ containerId: id, locale });

  if (!result.ok) {
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
