import type { Metadata } from "next";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { CheckCircle, Clock, PaperPlaneTilt, Warning } from "@phosphor-icons/react/dist/ssr";
import { Link } from "@/i18n/navigation";
import LocalDateTime from "@/shared/time/LocalDateTime";
import { formatInstant } from "@/shared/time/formatInstant";
import { currentAdmin } from "@/modules/admin/model/currentAdmin";
import AdminSection from "@/modules/admin/components/AdminSection";
import { listMoneyQueueRows, paymentDeclarations } from "@/modules/orders/model/orders";
import { buildMoneyQueue, type MoneyQueueRow } from "@/modules/orders/model/moneyQueue";
import { URGENT_WITHIN_HOURS } from "@/modules/orders/model/payment";
import { formatMoney } from "@/modules/orders/model/money";
import { orderTitle } from "@/modules/orders/model/orderSnapshot";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "AdminMoney" });
  return { title: t("heading"), robots: { index: false } };
}

/**
 * Who owes what, and what to do about each of them.
 *
 * ── THE GAP THIS CLOSES ─────────────────────────────────────────────────
 * The ledger was already complete: cost lines, payments, a balance, a
 * deadline, wire instructions, and a button letting a client say the transfer
 * has left. Every one of those wrote somewhere an admin would only find by
 * opening a case file and knowing to look. **The signal existed and surfaced
 * nowhere.** This is the screen that reads them all back.
 *
 * ── WHY IT IS NOT A TABLE SORTED BY DATE ────────────────────────────────
 * Three different actions live in here — price the car, check the bank, chase
 * the client — and each has a different answer to "is this urgent?". They are
 * split into three lists rather than sorted into one, so an operator reads the
 * heading rather than every row. The reasoning, and why the buckets must stay
 * mutually exclusive, is in `moneyQueue.ts`.
 *
 * Every row is a link into `/admin/orders/[id]`, because that is where the
 * action actually happens: this page never records a payment. A queue that
 * could also settle money would need every one of that page's guards
 * duplicated on it, and the second copy is the one that goes stale.
 */
export default async function AdminMoneyPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const user = await currentAdmin();
  if (!user) notFound();

  const t = await getTranslations({ locale, namespace: "AdminMoney" });
  const format = await getFormatter({ locale });

  const [{ rows, truncated }, declarations] = await Promise.all([
    listMoneyQueueRows(),
    paymentDeclarations(),
  ]);

  // One `now` for the whole page. Reading the clock per row would let two
  // sections disagree about whether the same order was overdue.
  const now = new Date();
  const queue = buildMoneyQueue(
    rows.map((row) => ({ ...row, declaredAt: declarations.get(row.reference) ?? null })),
    now
  );

  const { totals } = queue;
  const nothingOutstanding =
    queue.notInvoiced.length === 0 && queue.declared.length === 0 && queue.owed.length === 0;

  return (
    <div className="max-w-3xl">
      <h1 className="font-[family-name:var(--font-heading)] text-3xl font-extrabold tracking-tight text-char-900">
        {t("heading")}
      </h1>

      {/* The headline figure, per currency. Deliberately NOT converted into
          one number: the rate that would do it is frozen per file and is the
          one the bank actually gave us, so inventing a page-level rate would
          print a total nobody could reconcile against anything. */}
      {nothingOutstanding ? (
        <p className="mt-3 flex items-center gap-2 text-sm text-char-600">
          <CheckCircle size={18} weight="fill" className="text-green-600" />
          {t("allClear")}
        </p>
      ) : (
        <p className="mt-3 text-sm text-char-600">
          {/* Printed only when there is a figure to print. A page whose every
              outstanding car is still unpriced would otherwise open with
              "$0.00 across 0 vehicles" — a total that is arithmetically true,
              reads as good news, and describes nothing. */}
          {totals.orders > 0 && (
            <>
              <span className="text-2xl font-extrabold tabular-nums tracking-tight text-char-900">
                {[
                  totals.usdCents > 0 ? formatMoney(totals.usdCents, "USD", locale) : null,
                  totals.eurCents > 0 ? formatMoney(totals.eurCents, "EUR", locale) : null,
                ]
                  .filter(Boolean)
                  .join(" + ")}
              </span>{" "}
              {t("outstandingAcross", { count: totals.orders })}
            </>
          )}
          {totals.unknown > 0 && (
            <span className={totals.orders > 0 ? "text-char-500" : undefined}>
              {totals.orders > 0 ? " · " : ""}
              {t("notInTotal", { count: totals.unknown })}
            </span>
          )}
        </p>
      )}

      {truncated && (
        <p className="mt-3 flex items-start gap-2 rounded-xl bg-amber-50 px-4 py-3 text-sm text-char-800">
          <Warning size={17} weight="fill" className="mt-0.5 shrink-0 text-amber-600" />
          {t("truncated")}
        </p>
      )}

      <div className="mt-8">
        {/* First, because it is the only list where the delay is ours. A client
            cannot pay a figure nobody has sent them, and their deadline runs
            regardless. */}
        {queue.notInvoiced.length > 0 && (
          <AdminSection title={t("notInvoicedHeading")} count={queue.notInvoiced.length}>
            <p className="-mt-2 mb-3 text-sm text-char-600">{t("notInvoicedHint")}</p>
            <div className="space-y-3">
              {queue.notInvoiced.map((row) => (
                <Row key={row.id} row={row} locale={locale} t={t} format={format} now={now} />
              ))}
            </div>
          </AdminSection>
        )}

        {queue.declared.length > 0 && (
          <AdminSection title={t("declaredHeading")} count={queue.declared.length}>
            <p className="-mt-2 mb-3 text-sm text-char-600">{t("declaredHint")}</p>
            <div className="space-y-3">
              {queue.declared.map((row) => (
                <Row key={row.id} row={row} locale={locale} t={t} format={format} now={now} />
              ))}
            </div>
          </AdminSection>
        )}

        {queue.owed.length > 0 && (
          <AdminSection title={t("owedHeading")} count={queue.owed.length}>
            <div className="space-y-3">
              {queue.owed.map((row) => (
                <Row key={row.id} row={row} locale={locale} t={t} format={format} now={now} />
              ))}
            </div>
          </AdminSection>
        )}
      </div>
    </div>
  );
}

/**
 * One order, as a line in a queue.
 *
 * The amount is the largest thing on the row and the deadline sits under it,
 * in that order, because the two questions an operator has are "how much" and
 * "by when" — in that order. The car and the client follow; they are how you
 * recognise the row, not why you are reading it.
 */
function Row({
  row,
  locale,
  t,
  format,
  now,
}: {
  row: MoneyQueueRow;
  locale: string;
  t: (key: string, values?: Record<string, string | number | Date>) => string;
  format: Awaited<ReturnType<typeof getFormatter>>;
  now: Date;
}) {
  const state = row.status.state;
  const priced = state !== "awaiting_costs" && state !== "needs_rate";

  /**
   * Read off the deadline itself rather than off the state, because the
   * un-invoiced states carry no countdown — `hoursLeft` is null while there is
   * no figure to count down to. Keying the wording on `state === "overdue"`
   * put "due in" next to a date two days gone, on the single worst row the
   * page can show: a client's 24 hours spent, and no invoice ever sent.
   */
  const msLeft = row.status.dueAt ? row.status.dueAt.getTime() - now.getTime() : null;
  const overdue = msLeft !== null && msLeft <= 0;
  const urgent = msLeft !== null && msLeft > 0 && msLeft < URGENT_WITHIN_HOURS * 3_600_000;

  return (
    <Link
      href={`/admin/orders/${row.id}`}
      className={`flex flex-col gap-3 rounded-2xl border bg-white p-4 transition-colors hover:border-amber-400 sm:flex-row sm:items-center sm:justify-between ${
        overdue ? "border-red-300" : "border-char-200/70"
      }`}
    >
      <div className="min-w-0">
        {/* The amount, or plainly the fact that there isn't one yet. An
            un-invoiced car must never render as $0.00 — that is a figure, and
            somebody would eventually try to reconcile it. */}
        <p className="text-xl font-extrabold tabular-nums tracking-tight text-char-900">
          {priced ? (
            formatMoney(row.status.outstandingCents, row.currency, locale)
          ) : (
            <span className="text-base font-bold text-char-500">
              {state === "needs_rate" ? t("noRate") : t("noCosts")}
            </span>
          )}
        </p>

        {row.status.dueAt ? (
          <p
            className={`mt-1 flex flex-wrap items-center gap-x-1.5 text-sm font-semibold ${
              overdue ? "text-red-700" : urgent ? "text-amber-800" : "text-char-600"
            }`}
          >
            <Clock size={14} weight={overdue || urgent ? "fill" : "regular"} />
            <span>
              {overdue ? t("overdueBy") : t("dueIn")} {format.relativeTime(row.status.dueAt, now)}
            </span>
            <span className="font-normal text-char-400">
              <LocalDateTime
                iso={row.status.dueAt.toISOString()}
                locale={locale}
                fallback={formatInstant(row.status.dueAt.toISOString(), locale, "UTC")}
              />
            </span>
          </p>
        ) : (
          <p className="mt-1 text-sm text-char-500">{t("noDeadline")}</p>
        )}

        <p className="mt-1.5 truncate text-sm text-char-700">
          {orderTitle(row)} — {row.clientName}
        </p>
        <p className="truncate font-[family-name:var(--font-mono)] text-xs text-char-500">
          {row.reference} · {row.lotNumber} · {row.clientEmail}
        </p>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2">
        {/* Shown wherever the row ended up, including on an un-invoiced car:
            the client said something and it must not vanish because their file
            was filed under a different heading. */}
        {row.awaitingCheck && row.declaredAt && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-800">
            <PaperPlaneTilt size={13} weight="bold" />
            {t("saidSent", { when: format.relativeTime(row.declaredAt, now) })}
          </span>
        )}
        {/* Part-paid is worth its own badge: it changes the conversation from
            "have you paid?" to "the rest is still missing", and the two are
            not the same phone call. */}
        {priced && row.paymentCount > 0 && (
          <span className="rounded-full bg-char-100 px-3 py-1 text-xs font-semibold text-char-700">
            {t("partPaid")}
          </span>
        )}
      </div>
    </Link>
  );
}
