import { desc, eq, like } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { renderToBuffer, Document, Page, StyleSheet, Text, View, Image } from "@react-pdf/renderer";
import { db, schema } from "@/shared/db/client";
import { recordAudit } from "@/shared/db/audit";
import { wireAccount } from "@/shared/config/wire";
import { SITE } from "@/shared/config/site";
import { containerView } from "../model/containers";
import { invoiceNumberAfterCollision, nextInvoiceNumber } from "../model/invoiceNumber";
import { INK, invoiceLogo, registerInvoiceFonts } from "../pdf/theme";
import type { Bi } from "../pdf/InvoiceDocument";

/**
 * The freight invoice for a dedicated container — one negotiated sum, one
 * document, due BEFORE loading.
 *
 * Deliberately its own document rather than a variant of the car invoice:
 * a car invoice answers "what does this vehicle cost", this one answers
 * "what does moving YOUR container cost" — different subject, different
 * body, same theme, same bank block, same INV series. The number comes from
 * the same allocation as every other invoice, so the accountant's journal
 * stays one gapless sequence.
 *
 * The client pays US, always — no supplier name appears anywhere on it.
 */

async function pair(locale: string, key: string): Promise<Bi> {
  const mine = await getTranslations({ locale, namespace: "Orders" });
  const english = await getTranslations({ locale: "en", namespace: "Orders" });
  const primary = mine(key);
  const secondary = english(key);
  return { primary, secondary: primary === secondary ? null : secondary };
}

function money(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

function day(date: Date): string {
  return date.toISOString().slice(0, 10);
}

const s = StyleSheet.create({
  page: {
    fontFamily: "DejaVu",
    fontSize: 9,
    color: INK.char800,
    paddingTop: 30,
    paddingBottom: 52,
    paddingHorizontal: 40,
    lineHeight: 1.25,
  },
  headRow: { flexDirection: "row", alignItems: "flex-start", marginBottom: 12 },
  logo: { width: 30, height: 30, marginRight: 9, objectFit: "contain" },
  brand: { fontSize: 15, fontWeight: 700, color: INK.char900 },
  brandSub: { fontSize: 8, color: INK.char600, marginTop: 2 },
  headRight: { marginLeft: "auto", alignItems: "flex-end" },
  docTitle: { fontSize: 14, fontWeight: 700, color: INK.amber600, lineHeight: 1.2 },
  docTitleSub: { fontSize: 8, color: INK.char600, marginTop: 1, marginBottom: 7 },
  metaRow: { flexDirection: "row", marginTop: 1 },
  metaLabel: { fontSize: 8, color: INK.char600, width: 140, textAlign: "right", marginRight: 8 },
  metaValue: { fontSize: 9, fontWeight: 700, color: INK.char900 },
  rule: { height: 2, backgroundColor: INK.amber500, marginBottom: 12 },

  parties: { flexDirection: "row", marginBottom: 12 },
  party: { width: "50%", paddingRight: 16 },
  partyLabel: { fontSize: 7.5, color: INK.char600, letterSpacing: 0.8, marginBottom: 4 },
  partyName: { fontSize: 10, fontWeight: 700, color: INK.char900, marginBottom: 2 },
  partyLine: { fontSize: 9, color: INK.char700 },

  carsHead: { fontSize: 8, color: INK.char600, letterSpacing: 0.8, marginBottom: 4 },
  carsBox: {
    backgroundColor: INK.char50,
    borderLeftWidth: 2,
    borderLeftColor: INK.char300,
    padding: 9,
    marginBottom: 12,
  },
  carRow: { flexDirection: "row", paddingVertical: 2.5 },
  carName: { flexGrow: 1, fontSize: 9, color: INK.char900 },
  carMeta: { fontSize: 8.5, color: INK.char600 },

  lineRow: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: INK.char800,
    borderBottomWidth: 1,
    borderBottomColor: INK.char100,
    paddingVertical: 8,
  },
  lineLabel: { flexGrow: 1, paddingRight: 12 },
  linePrimary: { fontSize: 10, color: INK.char900 },
  lineSecondary: { fontSize: 8, color: INK.char600 },
  lineAmount: { width: 100, textAlign: "right", fontSize: 10, fontWeight: 700, color: INK.char900 },

  dueRow: { flexDirection: "row", alignItems: "baseline", marginTop: 10, justifyContent: "flex-end" },
  dueLabel: { fontSize: 10, fontWeight: 700, color: INK.char900, marginRight: 10 },
  dueValue: { fontSize: 13, fontWeight: 700, color: INK.amber600 },

  noteBox: {
    marginTop: 12,
    backgroundColor: INK.amber50,
    borderWidth: 1,
    borderColor: INK.amber200,
    padding: 9,
  },
  noteText: { fontSize: 8.5, color: INK.char700, fontWeight: 700 },
  noteSub: { fontSize: 8.5, color: INK.char600, marginTop: 2 },

  payTitle: { fontSize: 9, fontWeight: 700, color: INK.char900, letterSpacing: 0.6, marginTop: 14, marginBottom: 6 },
  payStack: { },
  bankRow: { flexDirection: "row", marginBottom: 3 },
  bankLabel: { width: 150, fontSize: 8, color: INK.char600, paddingRight: 10 },
  bankValue: { flexGrow: 1, flexShrink: 1, fontSize: 9, color: INK.char900 },
  bankStrong: { flexGrow: 1, fontSize: 9, fontWeight: 700, color: INK.char900 },
  refBox: { borderWidth: 1, borderColor: INK.char800, padding: 10, marginBottom: 10 },
  refLabel: { fontSize: 7.5, color: INK.char600, letterSpacing: 0.8 },
  refValue: { fontSize: 15, fontWeight: 700, color: INK.char900, letterSpacing: 1 },
  refHint: { fontSize: 8, color: INK.char600, marginTop: 3 },
  deadlineLabel: { fontSize: 7, color: INK.char500, letterSpacing: 0.8 },
  deadlineValue: { fontSize: 11, fontWeight: 700, color: INK.amber600 },

  footer: {
    position: "absolute",
    bottom: 22,
    left: 40,
    right: 40,
    borderTopWidth: 1,
    borderTopColor: INK.char200,
    paddingTop: 5,
  },
  footerText: { fontSize: 7.5, color: INK.char600 },
});

function inline(bi: Bi): string {
  return bi.secondary ? `${bi.primary} / ${bi.secondary}` : bi.primary;
}

export type ContainerIssueResult =
  | { ok: true; id: string; number: string }
  | { ok: false; reason: "not_found" | "no_bank" | "no_storage" };

export async function issueContainerInvoice(input: {
  containerId: string;
  adminId: string;
  /** Same contract as issueInvoice: undefined = the client's own language. */
  locale?: string;
  storage: {
    put(i: { key: string; body: Uint8Array; contentType: string }): Promise<void>;
    remove(key: string): Promise<void>;
  } | null;
}): Promise<ContainerIssueResult> {
  if (!input.storage) return { ok: false, reason: "no_storage" };
  const bank = wireAccount();
  if (!bank) return { ok: false, reason: "no_bank" };

  const container = await containerView(input.containerId);
  if (!container) return { ok: false, reason: "not_found" };

  const owner = await db()
    .select({ name: schema.users.name, locale: schema.users.locale })
    .from(schema.users)
    .innerJoin(schema.containers, eq(schema.containers.userId, schema.users.id))
    .where(eq(schema.containers.id, input.containerId))
    .limit(1);
  if (!owner[0]) return { ok: false, reason: "not_found" };
  const locale =
    input.locale && (["lt", "en", "ru"] as string[]).includes(input.locale)
      ? input.locale
      : owner[0].locale || "en";

  const L = {
    title: await pair(locale, "invoice.title"),
    invoiceNo: await pair(locale, "invoice.invoiceNo"),
    issued: await pair(locale, "invoice.issued"),
    seller: await pair(locale, "invoice.seller"),
    buyer: await pair(locale, "invoice.buyer"),
    amount: await pair(locale, "invoice.amount"),
    container: await pair(locale, "invoice.container"),
    cars: await pair(locale, "invoice.carsInContainer"),
    freightLine: await pair(locale, "invoice.freightLine"),
    loadNote: await pair(locale, "invoice.loadNote"),
    loadNoteSub: await pair(locale, "invoice.loadNoteSub"),
    vatNote: await pair(locale, "invoice.vatNote"),
    due: await pair(locale, "invoice.freightDueLabel"),
    payTitle: await pair(locale, "pay.title"),
    beneficiary: await pair(locale, "pay.beneficiary"),
    beneficiaryAddress: await pair(locale, "pay.beneficiaryAddress"),
    bank: await pair(locale, "pay.bank"),
    bankAddress: await pair(locale, "pay.bankAddress"),
    account: await pair(locale, "pay.account"),
    swift: await pair(locale, "pay.swift"),
    routing: await pair(locale, "pay.routing"),
    reference: await pair(locale, "pay.referenceLabel"),
    referenceHint: await pair(locale, "pay.referenceHint"),
    chargesTitle: await pair(locale, "pay.chargesTitle"),
    chargesBody: await pair(locale, "pay.chargesBody"),
  };

  const issuedAt = new Date();
  const year = issuedAt.getUTCFullYear();
  const latest = await db()
    .select({ number: schema.orderInvoices.number })
    .from(schema.orderInvoices)
    .where(like(schema.orderInvoices.number, `INV-${year}-%`))
    .orderBy(desc(schema.orderInvoices.number))
    .limit(1);
  let number = nextInvoiceNumber(latest[0]?.number ?? null, year);

  registerInvoiceFonts();

  for (let attempt = 0; attempt < 3; attempt++) {
    const pdf = await renderToBuffer(
      <Document title={`${number} · ${container.reference}`} author="Smart Auto Bid LLC">
        <Page size="A4" style={s.page}>
          <View style={s.headRow}>
            {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image, not a DOM img; PDFs carry no alt */}
            <Image src={invoiceLogo()} style={s.logo} />
            <View>
              <Text style={s.brand}>Smart Auto Bid LLC</Text>
              <Text style={s.brandSub}>{SITE.email}</Text>
            </View>
            <View style={s.headRight}>
              <Text style={s.docTitle}>{L.title.primary}</Text>
              {L.title.secondary ? <Text style={s.docTitleSub}>{L.title.secondary}</Text> : null}
              <View style={s.metaRow}>
                <Text style={s.metaLabel}>{inline(L.invoiceNo)}</Text>
                <Text style={s.metaValue}>{number}</Text>
              </View>
              <View style={s.metaRow}>
                <Text style={s.metaLabel}>{inline(L.issued)}</Text>
                <Text style={s.metaValue}>{day(issuedAt)}</Text>
              </View>
              <View style={s.metaRow}>
                <Text style={s.metaLabel}>{inline(L.container)}</Text>
                <Text style={s.metaValue}>
                  {container.reference} · {container.containerType}
                </Text>
              </View>
            </View>
          </View>
          <View style={s.rule} />

          <View style={s.parties}>
            <View style={s.party}>
              <Text style={s.partyLabel}>{inline(L.seller).toUpperCase()}</Text>
              <Text style={s.partyName}>Smart Auto Bid LLC</Text>
              <Text style={s.partyLine}>289 Telfair Rd</Text>
              <Text style={s.partyLine}>Savannah, GA 31415, United States</Text>
              <Text style={s.partyLine}>{SITE.phone.display}</Text>
            </View>
            <View style={s.party}>
              <Text style={s.partyLabel}>{inline(L.buyer).toUpperCase()}</Text>
              <Text style={s.partyName}>{owner[0].name}</Text>
            </View>
          </View>

          <Text style={s.carsHead}>{inline(L.cars).toUpperCase()}</Text>
          <View style={s.carsBox}>
            {container.cars.map((car) => (
              <View key={car.id} style={s.carRow}>
                <Text style={s.carName}>
                  {[car.year, car.make, car.model].filter(Boolean).join(" ") || "—"}
                </Text>
                <Text style={s.carMeta}>
                  {car.reference} · LOT {car.lotNumber}
                  {car.vin ? ` · ${car.vin}` : ""}
                </Text>
              </View>
            ))}
          </View>

          <View style={s.lineRow}>
            <View style={s.lineLabel}>
              <Text style={s.linePrimary}>{L.freightLine.primary}</Text>
              {L.freightLine.secondary ? (
                <Text style={s.lineSecondary}>{L.freightLine.secondary}</Text>
              ) : null}
            </View>
            <Text style={s.lineAmount}>{money(container.freightCents)} USD</Text>
          </View>

          <View style={s.dueRow}>
            <Text style={s.dueLabel}>{inline(L.due)}</Text>
            <Text style={s.dueValue}>{day(container.dueAt)}</Text>
          </View>

          {/* The lever, printed where nobody can miss it. */}
          <View style={s.noteBox}>
            <Text style={s.noteText}>{L.loadNote.primary}</Text>
            {L.loadNote.secondary ? <Text style={s.noteSub}>{L.loadNote.secondary}</Text> : null}
            <Text style={s.noteSub}>{inline(L.loadNoteSub)}</Text>
          </View>

          <Text style={s.payTitle}>{inline(L.payTitle).toUpperCase()}</Text>
          <View style={s.payStack}>
            <View style={s.refBox}>
              <Text style={s.refLabel}>{inline(L.reference).toUpperCase()}</Text>
              <Text style={s.refValue}>{container.reference}</Text>
              <Text style={s.refHint}>{inline(L.referenceHint)}</Text>
            </View>
            <BankRow label={inline(L.beneficiary)} value={bank.beneficiary} />
            {bank.beneficiaryAddress ? (
              <BankRow label={inline(L.beneficiaryAddress)} value={bank.beneficiaryAddress} />
            ) : null}
            <BankRow label={inline(L.bank)} value={bank.bankName} />
            {bank.bankAddress ? (
              <BankRow label={inline(L.bankAddress)} value={bank.bankAddress} />
            ) : null}
            <BankRow label={inline(L.account)} value={bank.accountNumber} strong />
            <BankRow label={inline(L.swift)} value={bank.swift} strong />
            {bank.routing ? <BankRow label={inline(L.routing)} value={bank.routing} /> : null}
            <View style={s.noteBox}>
              <Text style={s.noteText}>{L.chargesTitle.primary}</Text>
              <Text style={s.noteSub}>{L.chargesBody.primary}</Text>
            </View>
          </View>

          <View style={s.footer} fixed>
            <Text style={s.footerText}>{inline(L.vatNote)}</Text>
            <Text style={s.footerText}>
              Smart Auto Bid LLC · {SITE.email} · {SITE.phone.display}
            </Text>
          </View>
        </Page>
      </Document>
    );

    const key = `containers/${container.id}/invoices/${number}.pdf`;
    await input.storage.put({ key, body: pdf, contentType: "application/pdf" });

    try {
      const inserted = await db()
        .insert(schema.orderInvoices)
        .values({
          containerId: container.id,
          number,
          totalCents: container.freightCents,
          currency: "USD",
          paidCents: 0,
          r2Key: key,
          locale,
          issuedBy: input.adminId,
          issuedAt,
        })
        .returning({ id: schema.orderInvoices.id });

      await recordAudit(input.adminId, "invoice.issued", "container", container.id, {
        number,
        totalCents: container.freightCents,
        currency: "USD",
      });
      return { ok: true, id: inserted[0].id, number };
    } catch (e) {
      await input.storage.remove(key).catch(() => {});
      if (!(e instanceof Error && /unique|duplicate/i.test(e.message))) throw e;
      number = invoiceNumberAfterCollision(number, year);
    }
  }
  throw new Error("invoice number allocation failed three times");
}

function BankRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={s.bankRow}>
      <Text style={s.bankLabel}>{label}</Text>
      <Text style={strong ? s.bankStrong : s.bankValue}>{value}</Text>
    </View>
  );
}
