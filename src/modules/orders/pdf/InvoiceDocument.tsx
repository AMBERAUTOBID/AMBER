import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { Style } from "@react-pdf/stylesheet";
import type { InvoiceGroup, InvoiceTotal } from "../model/invoiceLines";
import { INK, NO_HYPHENS, invoiceLogo, registerInvoiceFonts } from "./theme";

/**
 * A label in the client's language and in English, on one document.
 *
 * ── WHY ONE BILINGUAL FILE AND NOT TWO ──────────────────────────────────
 * Decided with the owner 2026-08-19, having first proposed sending a
 * Lithuanian invoice and an English one side by side. Two files are two
 * truths: eventually somebody sends only one of them, or a correction lands
 * in one and not the other, and in a dispute we are holding two different
 * invoices for the same car. An invoice also carries almost no prose — about
 * a dozen labels — so the bilingual version is barely longer, and it
 * generalises to Russian for free off the same message keys.
 *
 * `secondary` is null when the reader's language IS English, so the document
 * prints one line rather than the same words twice.
 */
export interface Bi {
  primary: string;
  secondary?: string | null;
}

export interface InvoiceLabels {
  /** `JUODRAŠTIS – ne dokumentas` — used only by the preview render. */
  draftMark: Bi;
  title: Bi;
  invoiceNo: Bi;
  issued: Bi;
  seller: Bi;
  buyer: Bi;
  vehicle: Bi;
  caseNo: Bi;
  lot: Bi;
  vin: Bi;
  sold: Bi;
  description: Bi;
  amount: Bi;
  total: Bi;
  paid: Bi;
  due: Bi;
  depositNote: Bi;
  vatNote: Bi;
  payTitle: Bi;
  beneficiary: Bi;
  beneficiaryAddress: Bi;
  bank: Bi;
  bankAddress: Bi;
  account: Bi;
  swift: Bi;
  routing: Bi;
  reference: Bi;
  referenceHint: Bi;
  deadline: Bi;
  chargesTitle: Bi;
  chargesBody: Bi;
  /** Keyed by `OrderCostKind`. */
  costKind: Record<string, Bi>;
}

export interface InvoiceBank {
  beneficiary: string;
  beneficiaryAddress: string | null;
  bankName: string;
  bankAddress: string | null;
  accountNumber: string;
  swift: string;
  routing: string | null;
}

export interface InvoiceDocumentProps {
  /** Our own sequential number — `INV-2026-0001`. Not the case reference. */
  number: string;
  issuedAt: Date;
  seller: { name: string; lines: string[]; email: string; phone: string };
  buyer: { name: string; lines: string[] };
  vehicle: {
    description: string;
    vin: string | null;
    lot: string;
    platform: string;
    soldAt: Date | null;
  };
  caseReference: string;
  groups: InvoiceGroup[];
  total: InvoiceTotal;
  paidCents: number;
  bank: InvoiceBank;
  /** What the client must type into the payment reference — the case number. */
  paymentReference: string;
  dueAt: Date | null;
  /** Held, and deliberately NOT deducted. Null when there is none. */
  depositHeldCents: number | null;
  labels: InvoiceLabels;
  /**
   * Set on the admin's preview render and NOWHERE else. Prints a diagonal
   * watermark across the page and replaces the number, so a forwarded copy
   * can never pass for the document — the preview exists precisely so the
   * real one is issued with confidence, not to be a second original.
   */
  draft?: Bi | null;
}

/**
 * Amounts are formatted `8,048.00` regardless of the reader's language, and
 * that is deliberate.
 *
 * Everywhere else on the site money follows the locale, so a Lithuanian sees
 * `8 048,00 $`. On an invoice that number is retyped into a bank form by
 * somebody who may not be the reader, and `8 048,00` has been keyed as 8.048
 * often enough that international invoicing settled on one format long ago.
 * The ISO code is printed beside every total for the same reason.
 */
function money(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

/** `2026-08-18` — the one date format no country reads backwards. */
function day(date: Date): string {
  return date.toISOString().slice(0, 10);
}

const s = StyleSheet.create({
  page: {
    fontFamily: "DejaVu",
    fontSize: 9,
    color: INK.char800,
    paddingTop: 26,
    paddingBottom: 44,
    paddingHorizontal: 40,
    lineHeight: 1.2,
  },

  headRow: { flexDirection: "row", alignItems: "flex-start", marginBottom: 8 },
  logo: { width: 30, height: 30, marginRight: 9, objectFit: "contain" },
  brand: { fontSize: 15, fontWeight: 700, color: INK.char900, letterSpacing: -0.3 },
  brandSub: { fontSize: 8, color: INK.char600, marginTop: 2 },
  headRight: { marginLeft: "auto", alignItems: "flex-end" },
  docTitle: { fontSize: 14, fontWeight: 700, color: INK.amber600, letterSpacing: 0.4, lineHeight: 1.2 },
  docTitleSub: { fontSize: 8, color: INK.char600, letterSpacing: 0.4, marginTop: 1, marginBottom: 7 },
  metaRow: { flexDirection: "row", marginTop: 1 },
  metaLabel: { fontSize: 8, color: INK.char600, width: 132, textAlign: "right", marginRight: 8 },
  metaValue: { fontSize: 9, fontWeight: 700, color: INK.char900 },

  rule: { height: 2, backgroundColor: INK.amber500, marginBottom: 10 },

  parties: { flexDirection: "row", marginBottom: 8 },
  party: { width: "50%", paddingRight: 16 },
  partyLabel: { fontSize: 7.5, color: INK.char600, letterSpacing: 0.8, marginBottom: 4 },
  partyName: { fontSize: 10, fontWeight: 700, color: INK.char900, marginBottom: 2 },
  partyLine: { fontSize: 9, color: INK.char700 },

  vehicleBox: {
    backgroundColor: INK.char50,
    borderLeftWidth: 2,
    borderLeftColor: INK.char300,
    padding: 7,
    marginBottom: 7,
  },
  vehicleName: { fontSize: 10.5, fontWeight: 700, color: INK.char900, marginBottom: 4 },
  factRow: { flexDirection: "row", flexWrap: "wrap" },
  fact: { marginRight: 18, marginTop: 2 },
  factLabel: { fontSize: 7.5, color: INK.char600, letterSpacing: 0.6 },
  factValue: { fontSize: 9, color: INK.char800 },

  tHead: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: INK.char800,
    paddingBottom: 4,
    marginBottom: 2,
  },
  tHeadCell: { fontSize: 8, color: INK.char600, letterSpacing: 0.8 },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    borderBottomWidth: 1,
    borderBottomColor: INK.char100,
    paddingVertical: 4,
  },
  rowLabel: { flexGrow: 1, flexShrink: 1, paddingRight: 12 },
  rowPrimary: { fontSize: 9.5, color: INK.char900 },
  rowSecondary: { fontSize: 8, color: INK.char600 },
  rowAmount: { width: 92, textAlign: "right", fontSize: 9.5, color: INK.char900 },

  part: { flexDirection: "row", marginTop: 3, paddingLeft: 12 },
  partLabel: { flexGrow: 1, fontSize: 8.5, color: INK.char600 },
  partAmount: { width: 78, textAlign: "right", fontSize: 8.5, color: INK.char600 },

  totals: { marginTop: 8, alignItems: "flex-end" },
  totalRow: { flexDirection: "row", alignItems: "baseline", marginTop: 3 },
  totalLabel: { fontSize: 9, color: INK.char600, textAlign: "right", width: 190, marginRight: 10 },
  totalValue: { fontSize: 10, color: INK.char900, width: 108, textAlign: "right" },
  dueRow: {
    flexDirection: "row",
    alignItems: "baseline",
    marginTop: 5,
    paddingTop: 5,
    borderTopWidth: 1.5,
    borderTopColor: INK.char800,
  },
  dueLabel: {
    fontSize: 10,
    fontWeight: 700,
    color: INK.char900,
    textAlign: "right",
    width: 190,
    marginRight: 10,
  },
  dueValue: { fontSize: 13, fontWeight: 700, color: INK.amber600, width: 108, textAlign: "right" },

  noteBox: {
    marginTop: 8,
    backgroundColor: INK.amber50,
    borderWidth: 1,
    borderColor: INK.amber200,
    padding: 8,
  },
  noteText: { fontSize: 8, color: INK.char700 },
  noteStrong: { fontWeight: 700, color: INK.amber600 },

  payTitle: {
    fontSize: 9,
    fontWeight: 700,
    color: INK.char900,
    letterSpacing: 0.6,
    marginTop: 8,
    marginBottom: 4,
  },
  payGrid: { flexDirection: "row" },
  payCol: { width: "50%", paddingRight: 12 },
  bankRow: { flexDirection: "row", marginBottom: 2 },
  bankLabel: { width: 96, fontSize: 8, color: INK.char600, flexShrink: 0 },
  bankValue: { flex: 1, fontSize: 9, color: INK.char900 },
  bankValueMono: { flex: 1, fontSize: 9, color: INK.char900, fontWeight: 700 },

  refBox: { borderWidth: 1, borderColor: INK.char800, padding: 8, marginBottom: 7 },
  refLabel: { fontSize: 7.5, color: INK.char600, letterSpacing: 0.8 },
  refValue: { fontSize: 15, fontWeight: 700, color: INK.char900, letterSpacing: 1 },
  refHint: { fontSize: 8, color: INK.char600, marginTop: 3 },
  deadlineLabel: { fontSize: 7.5, color: INK.char600, letterSpacing: 0.8 },
  deadlineValue: { fontSize: 11, fontWeight: 700, color: INK.amber600 },

  footer: {
    position: "absolute",
    bottom: 18,
    left: 40,
    right: 40,
    borderTopWidth: 1,
    borderTopColor: INK.char200,
    paddingTop: 5,
  },
  footerText: { fontSize: 7.5, color: INK.char600 },
  footerRight: { fontSize: 7.5, color: INK.char600, marginTop: 1 },

  // Behind the content (first child renders first), light enough to read
  // through, big enough that no crop hides it.
  watermarkWrap: {
    position: "absolute",
    top: 320,
    left: 0,
    right: 0,
    alignItems: "center",
  },
  watermark: {
    fontSize: 46,
    fontWeight: 700,
    color: INK.char300,
    opacity: 0.35,
    letterSpacing: 3,
    transform: "rotate(-18deg)",
  },
  watermarkSub: {
    fontSize: 16,
    fontWeight: 700,
    color: INK.char300,
    opacity: 0.35,
    letterSpacing: 2,
    marginTop: 6,
    transform: "rotate(-18deg)",
  },
});

/** A heading in both languages, or one line when they would be identical. */
function Label({ value, style, subStyle }: { value: Bi; style?: Style; subStyle?: Style }) {
  return (
    <View>
      <Text hyphenationCallback={NO_HYPHENS} style={style}>{value.primary}</Text>
      {value.secondary ? <Text hyphenationCallback={NO_HYPHENS} style={subStyle}>{value.secondary}</Text> : null}
    </View>
  );
}

/** `Bylos Nr. / Case no.` — for the places a stacked label would waste a line. */
function inlineBi(value: Bi): string {
  return value.secondary ? `${value.primary} / ${value.secondary}` : value.primary;
}

export function InvoiceDocument(props: InvoiceDocumentProps) {
  registerInvoiceFonts();

  const { labels: L, total, bank } = props;
  const dueCents = total.amountCents - props.paidCents;

  return (
    <Document
      title={`${props.number} · ${props.caseReference}`}
      author={props.seller.name}
      subject={props.vehicle.description}
    >
      <Page size="A4" style={s.page}>
        {props.draft ? (
          <View style={s.watermarkWrap} fixed>
            <Text hyphenationCallback={NO_HYPHENS} style={s.watermark}>{props.draft.primary}</Text>
            {props.draft.secondary ? (
              <Text hyphenationCallback={NO_HYPHENS} style={s.watermarkSub}>{props.draft.secondary}</Text>
            ) : null}
          </View>
        ) : null}

        {/* ── header ─────────────────────────────────────────────── */}
        <View style={s.headRow}>
          {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image, not a DOM img; PDFs carry no alt */}
          <Image src={invoiceLogo()} style={s.logo} />
          <View>
            <Text hyphenationCallback={NO_HYPHENS} style={s.brand}>{props.seller.name}</Text>
            <Text hyphenationCallback={NO_HYPHENS} style={s.brandSub}>{props.seller.email}</Text>
          </View>
          <View style={s.headRight}>
            <Text hyphenationCallback={NO_HYPHENS} style={s.docTitle}>{L.title.primary}</Text>
            {L.title.secondary ? <Text hyphenationCallback={NO_HYPHENS} style={s.docTitleSub}>{L.title.secondary}</Text> : null}
            <View style={s.metaRow}>
              <Text hyphenationCallback={NO_HYPHENS} style={s.metaLabel}>{inlineBi(L.invoiceNo)}</Text>
              <Text hyphenationCallback={NO_HYPHENS} style={s.metaValue}>{props.number}</Text>
            </View>
            <View style={s.metaRow}>
              <Text hyphenationCallback={NO_HYPHENS} style={s.metaLabel}>{inlineBi(L.issued)}</Text>
              <Text hyphenationCallback={NO_HYPHENS} style={s.metaValue}>{day(props.issuedAt)}</Text>
            </View>
            <View style={s.metaRow}>
              <Text hyphenationCallback={NO_HYPHENS} style={s.metaLabel}>{inlineBi(L.caseNo)}</Text>
              <Text hyphenationCallback={NO_HYPHENS} style={s.metaValue}>{props.caseReference}</Text>
            </View>
          </View>
        </View>

        <View style={s.rule} />

        {/* ── who to whom ────────────────────────────────────────── */}
        <View style={s.parties}>
          <View style={s.party}>
            <Text hyphenationCallback={NO_HYPHENS} style={s.partyLabel}>{inlineBi(L.seller).toUpperCase()}</Text>
            <Text hyphenationCallback={NO_HYPHENS} style={s.partyName}>{props.seller.name}</Text>
            {props.seller.lines.map((line) => (
              <Text key={line} style={s.partyLine}>
                {line}
              </Text>
            ))}
            <Text hyphenationCallback={NO_HYPHENS} style={s.partyLine}>{props.seller.phone}</Text>
          </View>
          <View style={s.party}>
            <Text hyphenationCallback={NO_HYPHENS} style={s.partyLabel}>{inlineBi(L.buyer).toUpperCase()}</Text>
            <Text hyphenationCallback={NO_HYPHENS} style={s.partyName}>{props.buyer.name}</Text>
            {props.buyer.lines.map((line) => (
              <Text key={line} style={s.partyLine}>
                {line}
              </Text>
            ))}
          </View>
        </View>

        {/* ── the car ────────────────────────────────────────────── */}
        <View style={s.vehicleBox}>
          <Text hyphenationCallback={NO_HYPHENS} style={s.vehicleName}>{props.vehicle.description}</Text>
          <View style={s.factRow}>
            <View style={s.fact}>
              <Text hyphenationCallback={NO_HYPHENS} style={s.factLabel}>{inlineBi(L.vin).toUpperCase()}</Text>
              <Text hyphenationCallback={NO_HYPHENS} style={s.factValue}>{props.vehicle.vin ?? "—"}</Text>
            </View>
            <View style={s.fact}>
              <Text hyphenationCallback={NO_HYPHENS} style={s.factLabel}>{inlineBi(L.lot).toUpperCase()}</Text>
              <Text hyphenationCallback={NO_HYPHENS} style={s.factValue}>{props.vehicle.lot}</Text>
            </View>
            <View style={s.fact}>
              <Text hyphenationCallback={NO_HYPHENS} style={s.factLabel}>AUCTION</Text>
              <Text hyphenationCallback={NO_HYPHENS} style={s.factValue}>{props.vehicle.platform}</Text>
            </View>
            {props.vehicle.soldAt ? (
              <View style={s.fact}>
                <Text hyphenationCallback={NO_HYPHENS} style={s.factLabel}>{inlineBi(L.sold).toUpperCase()}</Text>
                <Text hyphenationCallback={NO_HYPHENS} style={s.factValue}>{day(props.vehicle.soldAt)}</Text>
              </View>
            ) : null}
          </View>
        </View>

        {/* ── the itemisation ────────────────────────────────────── */}
        <View style={s.tHead}>
          <Text hyphenationCallback={NO_HYPHENS} style={[s.tHeadCell, s.rowLabel]}>{inlineBi(L.description).toUpperCase()}</Text>
          <Text hyphenationCallback={NO_HYPHENS} style={[s.tHeadCell, s.rowAmount]}>{inlineBi(L.amount).toUpperCase()}</Text>
        </View>

        {props.groups.map((group, i) => {
          const label = L.costKind[group.kind] ?? { primary: group.kind };
          return (
            <View key={`${group.kind}-${group.currency}-${i}`} style={s.row} wrap={false}>
              <View style={s.rowLabel}>
                <Label value={label} style={s.rowPrimary} subStyle={s.rowSecondary} />
                {group.parts.map((part) => (
                  <View key={part.label} style={s.part}>
                    <Text hyphenationCallback={NO_HYPHENS} style={s.partLabel}>{part.label}</Text>
                    <Text hyphenationCallback={NO_HYPHENS} style={s.partAmount}>{money(part.amountCents)}</Text>
                  </View>
                ))}
              </View>
              <Text hyphenationCallback={NO_HYPHENS} style={s.rowAmount}>{money(group.amountCents)}</Text>
            </View>
          );
        })}

        {/* ── totals ─────────────────────────────────────────────── */}
        <View style={s.totals}>
          <View style={s.totalRow}>
            <Text hyphenationCallback={NO_HYPHENS} style={s.totalLabel}>{inlineBi(L.total)}</Text>
            <Text hyphenationCallback={NO_HYPHENS} style={s.totalValue}>
              {money(total.amountCents)} {total.currency}
            </Text>
          </View>
          {props.paidCents !== 0 ? (
            <View style={s.totalRow}>
              <Text hyphenationCallback={NO_HYPHENS} style={s.totalLabel}>{inlineBi(L.paid)}</Text>
              <Text hyphenationCallback={NO_HYPHENS} style={s.totalValue}>
                −{money(props.paidCents)} {total.currency}
              </Text>
            </View>
          ) : null}
          <View style={s.dueRow}>
            <Text hyphenationCallback={NO_HYPHENS} style={s.dueLabel}>{inlineBi(L.due)}</Text>
            <Text hyphenationCallback={NO_HYPHENS} style={s.dueValue}>
              {money(dueCents)} {total.currency}
            </Text>
          </View>
        </View>

        {/*
          The deposit line, and why it is a box rather than a footnote.

          A client holding a $2,500 deposit who reads a $8,048 invoice will
          wire $5,548 unless told otherwise, and our short-payment tolerance is
          $30 — so the file sits unsettled and the argument starts in the worst
          hour of the whole process. This sentence prevents a specific,
          predicted mistake; it is not boilerplate.
        */}
        {props.depositHeldCents !== null && props.depositHeldCents > 0 ? (
          <View style={s.noteBox}>
            <Text hyphenationCallback={NO_HYPHENS} style={s.noteText}>
              <Text hyphenationCallback={NO_HYPHENS} style={s.noteStrong}>{money(props.depositHeldCents)} USD — </Text>
              {L.depositNote.primary}
            </Text>
            {L.depositNote.secondary ? (
              <Text hyphenationCallback={NO_HYPHENS} style={[s.noteText, { color: INK.char600, marginTop: 2 }]}>
                {L.depositNote.secondary}
              </Text>
            ) : null}
          </View>
        ) : null}

        {/* ── how to pay ─────────────────────────────────────────── */}
        <Text hyphenationCallback={NO_HYPHENS} style={s.payTitle}>{inlineBi(L.payTitle).toUpperCase()}</Text>
        <View style={s.payGrid}>
          <View style={s.payCol}>
            <BankRow label={inlineBi(L.beneficiary)} value={bank.beneficiary} />
            {bank.beneficiaryAddress ? (
              <BankRow label={inlineBi(L.beneficiaryAddress)} value={bank.beneficiaryAddress} />
            ) : null}
            <BankRow label={inlineBi(L.bank)} value={bank.bankName} />
            {bank.bankAddress ? (
              <BankRow label={inlineBi(L.bankAddress)} value={bank.bankAddress} />
            ) : null}
            <BankRow label={inlineBi(L.account)} value={bank.accountNumber} strong />
            <BankRow label={inlineBi(L.swift)} value={bank.swift} strong />
            {bank.routing ? <BankRow label={inlineBi(L.routing)} value={bank.routing} /> : null}
          </View>

          <View style={s.payCol}>
            <View style={s.refBox}>
              <Text hyphenationCallback={NO_HYPHENS} style={s.refLabel}>{inlineBi(L.reference).toUpperCase()}</Text>
              <Text hyphenationCallback={NO_HYPHENS} style={s.refValue}>{props.paymentReference}</Text>
              <Text hyphenationCallback={NO_HYPHENS} style={s.refHint}>{inlineBi(L.referenceHint)}</Text>
            </View>
            {props.dueAt ? (
              <View style={{ marginBottom: 8 }}>
                <Text hyphenationCallback={NO_HYPHENS} style={s.deadlineLabel}>{inlineBi(L.deadline).toUpperCase()}</Text>
                <Text hyphenationCallback={NO_HYPHENS} style={s.deadlineValue}>{day(props.dueAt)}</Text>
              </View>
            ) : null}
            <Text hyphenationCallback={NO_HYPHENS} style={[s.noteText, { fontWeight: 700 }]}>{L.chargesTitle.primary}</Text>
            <Text hyphenationCallback={NO_HYPHENS} style={[s.noteText, { color: INK.char600 }]}>{L.chargesBody.primary}</Text>
          </View>
        </View>

        {/*
          Stacked, not side by side. As a row the VAT sentence had no width of
          its own and ran straight underneath the contact line, printing both
          on top of each other — legible in neither language.
        */}
        <View style={s.footer} fixed>
          <Text hyphenationCallback={NO_HYPHENS} style={s.footerText}>{inlineBi(L.vatNote)}</Text>
          <Text hyphenationCallback={NO_HYPHENS} style={s.footerRight}>
            {props.seller.name} · {props.seller.email} · {props.seller.phone}
          </Text>
        </View>
      </Page>
    </Document>
  );
}

function BankRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={s.bankRow}>
      <Text hyphenationCallback={NO_HYPHENS} style={s.bankLabel}>{label}</Text>
      <Text hyphenationCallback={NO_HYPHENS} style={strong ? s.bankValueMono : s.bankValue}>{value}</Text>
    </View>
  );
}
