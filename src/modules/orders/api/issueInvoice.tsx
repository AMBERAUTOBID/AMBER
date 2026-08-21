import { desc, eq, like } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { Font, renderToBuffer } from "@react-pdf/renderer";

// Registered HERE, beside the renderToBuffer this file calls, because the
// bundler can duplicate @react-pdf between chunks: a callback registered in
// another module can land on a different Font instance than the one this
// render uses — which is how «Комиссию printed as «- on a real invoice while
// an isolated test wrapped cleanly. Same-file import, same instance, always.
Font.registerHyphenationCallback((word) => [word]);
// ⚠️ Known residual: the DEV server still hyphenates «Комиссию as «- in the
// charges box — Next dev evaluates this module in two graphs with two Font
// instances, and the layout run appears to consult yet another. A clean
// single-instance process (tsx scripts, production build) honours this
// registration — measured with scripts/preview-invoice.tsx. Re-check the
// first invoice issued on production; if the dash survives there, the
// reproduction lives in the 2026-08-21 session notes.
import { db, schema } from "@/shared/db/client";
import { recordAudit } from "@/shared/db/audit";
import { wireAccount } from "@/shared/config/wire";
import { SITE } from "@/shared/config/site";
import { heldForBiddingBy } from "@/modules/bids/model/bidRequests";
import { clientCostRows, type CostLineRow } from "../model/money";
import { invoiceGroups, invoiceTotal } from "../model/invoiceLines";
import {
  invoiceNumberAfterCollision,
  nextInvoiceNumber,
} from "../model/invoiceNumber";
import { shippingProfileFor } from "@/modules/account/model/shippingProfile";
import {
  InvoiceDocument,
  type Bi,
  type InvoiceLabels,
} from "../pdf/InvoiceDocument";
import { listCostLines, listPayments } from "../model/orders";
import { paymentDueAt } from "../model/payment";
import { ORDER_COST_KINDS } from "@/shared/db/schema";

/**
 * Issue an invoice: cost lines → bilingual PDF → R2 → an immutable row.
 *
 * The refusals are the design. Each one guards a specific way a money
 * document could lie, and every refusal happens BEFORE anything is written:
 *
 *  - `no_lines`      — an unpriced file invoiced for $0.00 is a lie
 *  - `two_currencies`— summing USD and EUR without the frozen rate invents one
 *  - `no_bank`       — instructions with no account send money nowhere
 *  - `no_storage`    — a numbered invoice whose bytes were never kept cannot
 *                      be re-shown in a dispute, which defeats the ledger
 */
export type IssueRefusal = "no_lines" | "two_currencies" | "no_bank" | "no_storage" | "not_found";

export type IssueResult =
  | { ok: true; id: string; number: string; totalCents: number; currency: "USD" | "EUR" }
  | { ok: false; reason: IssueRefusal };

/**
 * Labels in the client's language over English — the PDF's whole vocabulary.
 *
 * Every cost-kind name and every bank-field label is a key the site has
 * rendered since the case files were built; only `Orders.invoice.*` is new.
 * When the reader's language IS English the second line is dropped, so the
 * document never says the same thing twice.
 */
async function buildLabels(locale: string): Promise<InvoiceLabels> {
  const mine = await getTranslations({ locale, namespace: "Orders" });
  const english = await getTranslations({ locale: "en", namespace: "Orders" });

  const pair = (key: string): Bi => {
    const primary = mine(key);
    const secondary = english(key);
    return { primary, secondary: primary === secondary ? null : secondary };
  };

  return {
    title: pair("invoice.title"),
    invoiceNo: pair("invoice.invoiceNo"),
    issued: pair("invoice.issued"),
    seller: pair("invoice.seller"),
    buyer: pair("invoice.buyer"),
    vehicle: pair("title"),
    caseNo: pair("reference"),
    lot: pair("lotNumber"),
    vin: pair("vin"),
    sold: pair("invoice.sold"),
    description: pair("invoice.description"),
    amount: pair("invoice.amount"),
    total: pair("costs.total"),
    paid: pair("costs.paid"),
    due: pair("costs.balance"),
    depositNote: pair("invoice.depositNote"),
    vatNote: pair("invoice.vatNote"),
    payTitle: pair("pay.title"),
    beneficiary: pair("pay.beneficiary"),
    beneficiaryAddress: pair("pay.beneficiaryAddress"),
    bank: pair("pay.bank"),
    bankAddress: pair("pay.bankAddress"),
    account: pair("pay.account"),
    swift: pair("pay.swift"),
    routing: pair("pay.routing"),
    reference: pair("pay.referenceLabel"),
    referenceHint: pair("pay.referenceHint"),
    deadline: pair("pay.deadline"),
    chargesTitle: pair("pay.chargesTitle"),
    chargesBody: pair("pay.chargesBody"),
    costKind: Object.fromEntries(ORDER_COST_KINDS.map((kind) => [kind, pair(`costKind.${kind}`)])),
  };
}

/** `2015 MERCEDES-BENZ GL 450` from the snapshot, skipping what is null. */
function describeVehicle(order: {
  year: number | null;
  make: string | null;
  model: string | null;
  series: string | null;
}): string {
  return (
    [order.year, order.make, order.model, order.series]
      .filter((part) => part !== null && part !== "")
      .join(" ") || "—"
  );
}

export async function issueInvoice(input: {
  orderId: string;
  adminId: string;
  /** Overrides the client's account locale for THIS document — the admin's
   * call at issue time. Undefined = the client's own language. */
  locale?: string;
  storage: {
    put(i: { key: string; body: Uint8Array; contentType: string }): Promise<void>;
    remove(key: string): Promise<void>;
  } | null;
}): Promise<IssueResult> {
  const { orderId, adminId, storage } = input;

  if (!storage) return { ok: false, reason: "no_storage" };

  const bank = wireAccount();
  if (!bank) return { ok: false, reason: "no_bank" };

  const orders = await db()
    .select()
    .from(schema.vehicleOrders)
    .where(eq(schema.vehicleOrders.id, orderId))
    .limit(1);
  const order = orders[0];
  if (!order) return { ok: false, reason: "not_found" };

  // The same folding the client's own page uses: hidden lines join the
  // residual rather than disappearing, so this total IS the page's total.
  const lines = (await listCostLines(orderId)) as CostLineRow[];
  const groups = invoiceGroups(clientCostRows(lines));
  const total = invoiceTotal(groups);
  if (!total) {
    return { ok: false, reason: groups.length === 0 ? "no_lines" : "two_currencies" };
  }

  // Payments in the invoice's own currency only — a EUR payment against a
  // USD invoice needs the frozen rate, and if one existed the file would
  // already be single-currency in practice. Understating `paid` is the safe
  // direction: the client sees slightly more owed, never less.
  const payments = await listPayments(orderId);
  const paidCents = payments
    .filter((p) => p.currency === total.currency)
    .reduce((sum, p) => sum + p.amountCents, 0);

  const owner = await db()
    .select({ name: schema.users.name, email: schema.users.email, locale: schema.users.locale })
    .from(schema.users)
    .where(eq(schema.users.id, order.userId))
    .limit(1);
  const ownerRow = owner[0];
  if (!ownerRow) return { ok: false, reason: "not_found" };

  // The buyer block prefers the shipping profile — the name EXACTLY as in
  // their documents is the profile's whole reason to exist. A client who
  // never filled it falls back to their account name, which is at least
  // honestly theirs.
  const profile = await shippingProfileFor(order.userId);
  const buyerName = profile?.buyerName ?? ownerRow.name;
  const buyerLines = [
    ...(profile?.buyerAddress ? profile.buyerAddress.split(/\r?\n/) : []),
    ...(profile?.buyerCountry ? [profile.buyerCountry] : []),
    ...(profile?.buyerPhone ? [profile.buyerPhone] : []),
  ];

  const locale =
    input.locale && (["lt", "en", "ru"] as string[]).includes(input.locale)
      ? input.locale
      : ownerRow.locale || "en";
  const labels = await buildLabels(locale);
  const depositHeld = await heldForBiddingBy(order.userId);
  const issuedAt = new Date();
  const year = issuedAt.getUTCFullYear();

  /**
   * Allocation loop. The unique index on `number` is the real arbiter; this
   * loop just keeps making sensible attempts. The bytes go to R2 BEFORE the
   * row exists — a row pointing at nothing is a broken download in a money
   * flow, while an orphaned object from a lost race is a few KB nobody can
   * reach, removed on the way out.
   */
  const latest = await db()
    .select({ number: schema.orderInvoices.number })
    .from(schema.orderInvoices)
    .where(like(schema.orderInvoices.number, `INV-${year}-%`))
    .orderBy(desc(schema.orderInvoices.number))
    .limit(1);

  let number = nextInvoiceNumber(latest[0]?.number ?? null, year);

  for (let attempt = 0; attempt < 3; attempt++) {
    const pdf = await renderToBuffer(
      <InvoiceDocument
        number={number}
        issuedAt={issuedAt}
        seller={{
          name: "Smart Auto Bid LLC",
          lines: ["289 Telfair Rd", "Savannah, GA 31415", "United States"],
          email: SITE.email,
          phone: SITE.phone.display,
        }}
        buyer={{ name: buyerName, lines: buyerLines }}
        vehicle={{
          description: describeVehicle(order),
          vin: order.vin,
          lot: order.lotNumber,
          platform: order.platform === "copart" ? "Copart" : "IAAI",
          soldAt: order.soldAt,
        }}
        caseReference={order.reference}
        groups={groups}
        total={total}
        paidCents={paidCents}
        bank={{
          beneficiary: bank.beneficiary,
          beneficiaryAddress: bank.beneficiaryAddress,
          bankName: bank.bankName,
          bankAddress: bank.bankAddress,
          accountNumber: bank.accountNumber,
          swift: bank.swift,
          routing: bank.routing,
        }}
        paymentReference={order.reference}
        dueAt={paymentDueAt(order.soldAt)}
        depositHeldCents={depositHeld > 0 ? depositHeld : null}
        labels={labels}
      />
    );

    const key = `orders/${orderId}/invoices/${number}.pdf`;
    await storage.put({ key, body: pdf, contentType: "application/pdf" });

    try {
      const inserted = await db()
        .insert(schema.orderInvoices)
        .values({
          orderId,
          number,
          totalCents: total.amountCents,
          currency: total.currency,
          paidCents,
          r2Key: key,
          locale,
          issuedBy: adminId,
          issuedAt,
        })
        .returning({ id: schema.orderInvoices.id });

      await recordAudit(adminId, "invoice.issued", "order", orderId, {
        number,
        totalCents: total.amountCents,
        currency: total.currency,
      });
      return {
        ok: true,
        id: inserted[0].id,
        number,
        totalCents: total.amountCents,
        currency: total.currency,
      };
    } catch (e: unknown) {
      // Lost the number race: another admin issued in the same second. The
      // uploaded bytes carry the losing number inside them, so they cannot be
      // reused — remove and try the next number with a fresh render.
      await storage.remove(key).catch(() => {});
      const unique = e instanceof Error && /unique|duplicate/i.test(e.message);
      if (!unique) throw e;
      number = invoiceNumberAfterCollision(number, year);
    }
  }

  // Three straight collisions is not a race any more; something is wrong.
  throw new Error("invoice number allocation failed three times");
}
