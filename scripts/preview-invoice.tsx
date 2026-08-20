/**
 * Render a sample invoice PDF so a human can look at it.
 *
 * ⚠️ **This script calls the real `InvoiceDocument`.** It does not re-describe
 * the layout, and it must never be allowed to: the mail module learned this
 * the expensive way when its preview harness hand-copied each message's blocks,
 * kept its stale copy after a fix, and made a corrected email look broken. A
 * preview that drifts from the thing it previews is worse than no preview.
 *
 * The figures are the real Copart receipt for lot 62288396 (2015 Mercedes-Benz
 * GL 450, sold 08/17/2026) plus the Aivi land-hauling line, so the totals here
 * are the ones the business actually saw.
 *
 *   npx tsx scripts/preview-invoice.ts [lt|en|ru]
 */
import { renderToFile } from "@react-pdf/renderer";
import path from "node:path";
import en from "../messages/en.json";
import lt from "../messages/lt.json";
import ru from "../messages/ru.json";
import {
  InvoiceDocument,
  type Bi,
  type InvoiceLabels,
} from "../src/modules/orders/pdf/InvoiceDocument";
import { invoiceGroups, invoiceTotal } from "../src/modules/orders/model/invoiceLines";
import type { ClientCostRow } from "../src/modules/orders/model/money";

type Messages = typeof en;

const BUNDLES: Record<string, Messages> = { en, lt: lt as Messages, ru: ru as Messages };

const locale = (process.argv[2] ?? "lt").toLowerCase();
const primary = BUNDLES[locale];
if (!primary) throw new Error(`unknown locale ${locale}; expected lt, en or ru`);

/**
 * A label in the reader's language over the same label in English.
 *
 * When the reader IS English the second line is dropped, so the document never
 * prints the same words twice. This is also the proof of the claim that the
 * bilingual invoice needs no new translations for its cost lines: every string
 * below comes out of `Orders.*`, which has existed since the case files were
 * built.
 */
function pair(pick: (m: Messages) => string): Bi {
  const mine = pick(primary);
  const english = pick(en);
  return { primary: mine, secondary: mine === english ? null : english };
}

/** The half-dozen strings an invoice needs that no page ever needed. */
function literal(ltText: string, enText: string, ruText: string): Bi {
  const mine = locale === "en" ? enText : locale === "ru" ? ruText : ltText;
  return { primary: mine, secondary: mine === enText ? null : enText };
}

const COST_KINDS = [
  "auction_price",
  "auction_fees",
  "late_fee",
  "title_mailing",
  "inland_transport",
  "terminal",
  "ocean_freight",
  "customs",
  "delivery",
  "commission",
  "other",
] as const;

const labels: InvoiceLabels = {
  title: literal("SĄSKAITA FAKTŪRA", "INVOICE", "СЧЁТ-ФАКТУРА"),
  invoiceNo: literal("Sąskaitos Nr.", "Invoice no.", "Счёт №"),
  issued: literal("Išrašyta", "Issued", "Выставлен"),
  seller: literal("Pardavėjas", "Seller", "Продавец"),
  buyer: literal("Pirkėjas", "Buyer", "Покупатель"),
  vehicle: literal("Automobilis", "Vehicle", "Автомобиль"),
  caseNo: pair((m) => m.Orders.reference),
  lot: pair((m) => m.Orders.lotNumber),
  vin: pair((m) => m.Orders.vin),
  sold: literal("Parduota", "Sold", "Продан"),
  description: literal("Paaiškinimas", "Description", "Описание"),
  amount: literal("Suma", "Amount", "Сумма"),
  total: pair((m) => m.Orders.costs.total),
  paid: pair((m) => m.Orders.costs.paid),
  due: pair((m) => m.Orders.costs.balance),
  depositNote: literal(
    "Jūsų depozitas lieka saugomas ir į šią sumą NEĮSKAIČIUOTAS. Perveskite visą aukščiau nurodytą sumą.",
    "Your deposit remains held and is NOT deducted from this invoice. Please transfer the full amount shown above.",
    "Ваш депозит остаётся на хранении и НЕ ВЫЧТЕН из этого счёта. Переведите полную сумму, указанную выше."
  ),
  vatNote: literal(
    "Smart Auto Bid LLC — JAV bendrovė. PVM neskaičiuojamas.",
    "Smart Auto Bid LLC is a US company. No VAT is charged.",
    "Smart Auto Bid LLC — компания США. НДС не начисляется."
  ),
  payTitle: pair((m) => m.Orders.pay.title),
  beneficiary: pair((m) => m.Orders.pay.beneficiary),
  beneficiaryAddress: pair((m) => m.Orders.pay.beneficiaryAddress),
  bank: pair((m) => m.Orders.pay.bank),
  bankAddress: pair((m) => m.Orders.pay.bankAddress),
  account: pair((m) => m.Orders.pay.account),
  swift: pair((m) => m.Orders.pay.swift),
  routing: pair((m) => m.Orders.pay.routing),
  reference: pair((m) => m.Orders.pay.referenceLabel),
  referenceHint: pair((m) => m.Orders.pay.referenceHint),
  deadline: pair((m) => m.Orders.pay.deadline),
  chargesTitle: pair((m) => m.Orders.pay.chargesTitle),
  chargesBody: pair((m) => m.Orders.pay.chargesBody),
  costKind: Object.fromEntries(
    COST_KINDS.map((kind) => [
      kind,
      pair((m) => (m.Orders.costKind as Record<string, string>)[kind]),
    ])
  ),
};

/** Lot 62288396, exactly as the Copart receipt and the Aivi invoice read. */
const rows: ClientCostRow[] = [
  { id: "1", kind: "auction_price", label: null, amountCents: 540_000, currency: "USD" },
  { id: "2", kind: "auction_fees", label: "Internet Bid Fee", amountCents: 9_900, currency: "USD" },
  { id: "3", kind: "auction_fees", label: "Gate Fee", amountCents: 7_900, currency: "USD" },
  { id: "4", kind: "auction_fees", label: "Title Pickup Fee", amountCents: 2_000, currency: "USD" },
  { id: "5", kind: "auction_fees", label: "Buyer Fee", amountCents: 62_500, currency: "USD" },
  { id: "6", kind: "inland_transport", label: null, amountCents: 27_500, currency: "USD" },
  { id: "7", kind: "ocean_freight", label: null, amountCents: 115_000, currency: "USD" },
  { id: "8", kind: "commission", label: null, amountCents: 40_000, currency: "USD" },
];

const groups = invoiceGroups(rows);
const maybeTotal = invoiceTotal(groups);
if (!maybeTotal) throw new Error("sample cannot be invoiced — check the fixture");
const total = maybeTotal;

const out = path.join(process.cwd(), `invoice-preview-${locale}.pdf`);

async function main() {
  await renderToFile(
  <InvoiceDocument
    number="INV-2026-0001"
    issuedAt={new Date("2026-08-18T09:00:00Z")}
    seller={{
      name: "Smart Auto Bid LLC",
      lines: ["289 Telfair Rd", "Savannah, GA 31415", "United States"],
      email: "info@smartautobid.com",
      phone: "+1 (912) 561-2347",
    }}
    buyer={{
      name: "Tomas Jankauskas",
      lines: ["Vilniaus g. 1", "01102 Vilnius", "Lietuva", "+370 612 34567"],
    }}
    vehicle={{
      description: "2015 MERCEDES-BENZ GL 450 4MATIC",
      vin: "4JGDF6EE2FA451534",
      lot: "62288396",
      platform: "Copart",
      soldAt: new Date("2026-08-17T22:26:00Z"),
    }}
    caseReference="SAB-2026-0001"
    groups={groups}
    total={total}
    paidCents={0}
    bank={{
      beneficiary: "Smart Auto Bid LLC",
      beneficiaryAddress: "289 Telfair Rd, Savannah, GA 31415, USA",
      bankName: "Bank of America, N.A.",
      bankAddress: "222 Broadway, New York, NY 10038, USA",
      accountNumber: "0000 0000 0000",
      swift: "BOFAUS3N",
      routing: "026009593",
    }}
    paymentReference="SAB-2026-0001"
    dueAt={new Date("2026-08-18T22:26:00Z")}
    depositHeldCents={250_000}
    labels={labels}
  />,
    out
  );

  console.log(`wrote ${out}`);
  console.log(
    `total ${(total.amountCents / 100).toFixed(2)} ${total.currency} · ${groups.length} groups`
  );
}

main();
