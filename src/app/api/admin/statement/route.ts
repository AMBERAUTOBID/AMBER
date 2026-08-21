import { NextResponse } from "next/server";
import { currentAdmin } from "@/modules/admin/model/currentAdmin";
import { parseStatement, STATEMENT_MAX_BYTES } from "@/modules/orders/model/statementImport";
import { resolveStatementCredits } from "@/modules/orders/model/statementResolve";

/**
 * Bank statement CSV → a matched preview. READ-ONLY by design.
 *
 * The statement is parsed in memory and never written anywhere — not to R2,
 * not to disk, not to a log. It carries other people's names and balances;
 * the only thing that survives this request is the JSON preview in the
 * admin's browser. Booking a line goes through the endpoints that already
 * own those writes (`orders/[id]/money`, `containers/[id]/paid`), so this
 * route needs none of their guards and can never disagree with them.
 */
export async function POST(request: Request) {
  const admin = await currentAdmin();
  if (!admin) return NextResponse.json({ ok: false }, { status: 404 });

  const body = (await request.json().catch(() => null)) as { csv?: unknown } | null;
  const csv = typeof body?.csv === "string" ? body.csv : null;
  if (!csv) return NextResponse.json({ ok: false, error: "invalid" }, { status: 400 });
  if (csv.length > STATEMENT_MAX_BYTES) {
    return NextResponse.json({ ok: false, error: "too_large" }, { status: 413 });
  }

  const parsed = parseStatement(csv);
  if (!parsed.ok) {
    return NextResponse.json({ ok: false, error: parsed.error }, { status: 422 });
  }

  const credits = await resolveStatementCredits(parsed.credits);

  return NextResponse.json({
    ok: true,
    credits,
    skippedDebits: parsed.skippedDebits,
    skippedUnreadable: parsed.skippedUnreadable,
    totalRows: parsed.totalRows,
  });
}
