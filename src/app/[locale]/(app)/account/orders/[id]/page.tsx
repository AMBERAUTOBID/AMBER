import type { Metadata } from "next";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { CheckCircle, Circle, DownloadSimple, FileText } from "@phosphor-icons/react/dist/ssr";
import { Link } from "@/i18n/navigation";
import { UUID } from "@/shared/validation";
import { requireUser } from "@/modules/account/model/requireUser";
import {
  getOrderForUser,
  listCostLines,
  listPayments,
  listVisibleOrderFiles,
  listVisibleStageEvents,
} from "@/modules/orders/model/orders";
import { orderTitle } from "@/modules/orders/model/orderSnapshot";
import { ORDER_STAGES, hasReached, stageProgress } from "@/modules/orders/model/stages";
import { clientCostRows, formatMoney, formatRate, orderMoney } from "@/modules/orders/model/money";
import { paymentStatus } from "@/modules/orders/model/payment";
import PaymentInstructions from "@/modules/orders/components/PaymentInstructions";
import { signFiles } from "@/modules/orders/api/signFiles";
import StageBadge from "@/modules/orders/components/StageBadge";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Orders" });
  return { title: t("title"), robots: { index: false } };
}

/**
 * One car, as its owner sees it.
 *
 * **Every read here is scoped to the person asking.** `getOrderForUser` puts
 * the ownership test inside the query rather than trusting a check in this
 * file, and the files, costs and payments are all fetched with their
 * visibility filter in the WHERE clause. Nothing an admin marked internal is
 * ever loaded into this page, so no amount of careless rendering can leak it.
 */
export default async function ClientOrderPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const user = await requireUser(locale, `/account/orders/${id}`);

  if (!UUID.test(id)) notFound();
  const order = await getOrderForUser(id, user.id);
  // 404, not 403 — somebody probing ids learns nothing about whether a file
  // exists that belongs to somebody else.
  if (!order) notFound();

  const t = await getTranslations({ locale, namespace: "Orders" });
  const format = await getFormatter({ locale });

  /**
   * Files and timeline events are fetched already filtered — what the client
   * may see is decided in the query, so no forgotten `if` in JSX can leak one.
   *
   * ⚠️ **Money is deliberately fetched UNFILTERED, and this is not an
   * oversight.** Hiding a cost line withholds what it is for, not the fact
   * that it is owed; asking the database for the visible ones and totalling
   * those would quietly reduce the client's balance and could report a file as
   * paid in full while money was outstanding. The filtering happens in
   * `clientCostRows`, which folds the hidden lines into a residual so the
   * table still adds up to the total beneath it.
   *
   * Payments are read in full for a different reason: nothing may hide one.
   * A payment missing from this list is the single most alarming thing a
   * client can find, their bank statement is the counter-record, and there is
   * no admin control that sets the flag in the first place.
   */
  const [files, events, costLines, payments] = await Promise.all([
    listVisibleOrderFiles(id),
    listVisibleStageEvents(id),
    listCostLines(id),
    listPayments(id),
  ]);

  const signed = await signFiles(files);
  const byStage = new Map<string, typeof signed>();
  for (const file of signed) {
    const list = byStage.get(file.stage) ?? [];
    list.push(file);
    byStage.set(file.stage, list);
  }

  const eventByStage = new Map(events.map((e) => [e.stage, e]));
  const progress = stageProgress(order.stage);
  const money = orderMoney(costLines, payments, order.usdToEurMicros);
  const shownCosts = clientCostRows(costLines);

  return (
    <div className="max-w-2xl">
      <Link
        href="/account/orders"
        className="text-sm font-semibold text-char-600 underline-offset-4 hover:underline"
      >
        ← {t("backToList")}
      </Link>

      <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-[family-name:var(--font-heading)] text-3xl font-extrabold tracking-tight text-char-900">
            {orderTitle(order)}
          </h1>
          <p className="mt-1 font-[family-name:var(--font-mono)] text-sm text-char-500">
            {t("reference")} {order.reference}
          </p>
        </div>
        <StageBadge stage={order.stage} />
      </div>

      {/* ── the facts about the car ──────────────────────────────────── */}
      <dl className="mt-8 grid grid-cols-2 gap-x-6 gap-y-4 rounded-2xl border border-char-200/70 bg-white p-5 text-sm sm:grid-cols-3">
        <Fact label={t("lotNumber")} value={order.lotNumber} />
        <Fact label={t("vin")} value={order.vin} />
        <Fact
          label={t("odometer")}
          value={
            order.odometer !== null
              ? `${format.number(order.odometer)} ${order.odometerUnit ?? ""}`.trim()
              : null
          }
          fallback={t("unknown")}
        />
        <Fact label={t("damage")} value={order.primaryDamage} fallback={t("unknown")} />
        <Fact label={t("document")} value={order.docType} fallback={t("unknown")} />
        <Fact
          label={t("keys")}
          value={order.hasKeys === null ? null : order.hasKeys ? t("keysYes") : t("keysNo")}
          fallback={t("unknown")}
        />
      </dl>

      {/* The title, on its own line and colour-coded. It is the single most
          asked question after "where is it", and it is a different fact from
          the document type shown above. */}
      <p
        className={`mt-3 inline-flex items-center rounded-full px-3 py-1.5 text-sm font-semibold ${
          order.titleReceivedAt ? "bg-green-50 text-green-800" : "bg-amber-50 text-amber-800"
        }`}
      >
        {order.titleReceivedAt
          ? t("titleReceived", {
              date: format.dateTime(order.titleReceivedAt, { dateStyle: "medium" }),
            })
          : t("titleWaiting")}
      </p>

      {/* Shown to the client precisely so they can catch a wrong name before
          it reaches a bill of lading. Correcting a consignee after customs
          paperwork is filed is expensive; correcting it here is a message. */}
      {(order.consigneeName || order.consigneeCompany || order.consigneeAddress) && (
        <section className="mt-6 rounded-2xl border border-char-200/70 bg-white p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-char-500">
            {t("consignee.heading")}
          </h2>
          <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-char-800">
            {[
              order.consigneeName,
              order.consigneeCompany,
              order.consigneeAddress,
              order.consigneeCountry,
              order.consigneePhone,
            ]
              .filter(Boolean)
              .join("\n")}
          </p>
          <p className="mt-3 text-xs text-char-500">{t("consignee.hint")}</p>
        </section>
      )}

      {/* ── shipping, only once there is something in it ─────────────── */}
      {(order.containerNumber || order.vesselName || order.destinationPort || order.etaAt) && (
        <section className="mt-6 rounded-2xl border border-char-200/70 bg-white p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-char-500">
            {t("shipping.heading")}
          </h2>
          <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-4 text-sm sm:grid-cols-3">
            <Fact label={t("shipping.container")} value={order.containerNumber} />
            <Fact label={t("shipping.billOfLading")} value={order.billOfLading} />
            <Fact label={t("shipping.vessel")} value={order.vesselName} />
            <Fact label={t("shipping.departurePort")} value={order.departurePort} />
            <Fact label={t("shipping.destinationPort")} value={order.destinationPort} />
            <Fact
              label={t("shipping.eta")}
              value={order.etaAt ? format.dateTime(order.etaAt, { dateStyle: "medium" }) : null}
            />
          </dl>
        </section>
      )}

      {/* ── the timeline, which is the whole point ───────────────────── */}
      <section className="mt-6">
        <p className="text-sm text-char-600">{t("progress", progress)}</p>
        <ol className="mt-4 space-y-6">
          {ORDER_STAGES.map((stage) => {
            const reached = hasReached(order.stage, stage);
            const event = eventByStage.get(stage);
            const stageFiles = byStage.get(stage) ?? [];
            return (
              <li key={stage} className="flex gap-3">
                <div className="mt-0.5 shrink-0">
                  {reached ? (
                    <CheckCircle size={18} weight="fill" className="text-amber-500" />
                  ) : (
                    <Circle size={18} className="text-char-300" />
                  )}
                </div>
                <div className={`min-w-0 flex-1 ${reached ? "" : "opacity-50"}`}>
                  <p className="flex flex-wrap items-baseline gap-2">
                    <span className="font-semibold text-char-900">{t(`stage.${stage}`)}</span>
                    {event && (
                      <span className="text-xs text-char-500">
                        {format.dateTime(event.happenedAt, { dateStyle: "medium" })}
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 text-sm text-char-600">
                    {reached ? t(`stageHint.${stage}`) : t("stagePending")}
                  </p>
                  {event?.note && (
                    <p className="mt-2 rounded-xl bg-char-50 px-3 py-2 text-sm text-char-700">
                      {event.note}
                    </p>
                  )}
                  {stageFiles.length > 0 && <Gallery files={stageFiles} label={t("media.download")} />}
                </div>
              </li>
            );
          })}
        </ol>
      </section>

      {/* ── how to pay ───────────────────────────────────────────────────
          ABOVE the itemisation, deliberately. A client who opens this page
          owing money wants two things — the number and where to send it — and
          making them scroll past a cost table to reach the account details is
          how a payment turns into a WhatsApp message instead. The breakdown
          below is for checking; this is for acting. */}
      <div className="mt-8">
        <PaymentInstructions
          status={paymentStatus(
            {
              soldAt: order.soldAt,
              // The euro balance is what the client is quoted whenever a rate
              // has been frozen; without one the order is dollars only.
              balanceCents: money.balanceEur ?? money.balanceUsd,
              paymentsMade: payments.length,
              costLineCount: costLines.length,
            },
            new Date()
          )}
          currency={money.balanceEur !== null ? "EUR" : "USD"}
          reference={order.reference}
          locale={locale}
          labels={{
            title: t("pay.title"),
            amount: t("pay.amount"),
            deadline: t("pay.deadline"),
            urgent: t("pay.urgent"),
            overdue: t("pay.overdue"),
            undated: t("pay.undated"),
            chargesTitle: t("pay.chargesTitle"),
            chargesBody: t("pay.chargesBody"),
            referenceLabel: t("pay.referenceLabel"),
            referenceHint: t("pay.referenceHint"),
            beneficiary: t("pay.beneficiary"),
            beneficiaryAddress: t("pay.beneficiaryAddress"),
            bank: t("pay.bank"),
            bankAddress: t("pay.bankAddress"),
            account: t("pay.account"),
            swift: t("pay.swift"),
            routing: t("pay.routing"),
            noDetails: t("pay.noDetails"),
            paidTitle: t("pay.paidTitle"),
            paidBody: t("pay.paidBody"),
            forgiven: t("pay.forgiven"),
            awaitingTitle: t("pay.awaitingTitle"),
            awaitingBody: t("pay.awaitingBody"),
          }}
        />
      </div>

      {/* ── money ────────────────────────────────────────────────────── */}
      <section className="mt-8 rounded-2xl border border-char-200/70 bg-white p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-char-500">
          {t("costs.heading")}
        </h2>

        {costLines.length === 0 ? (
          <p className="mt-4 text-sm text-char-600">{t("costs.empty")}</p>
        ) : (
          <>
            <table className="mt-4 w-full text-sm">
              <tbody>
                {shownCosts.map((line) => (
                  <tr key={line.id} className="border-b border-char-100 last:border-0">
                    <td className="py-2 text-char-700">
                      {line.label || t(`costKind.${line.kind}`)}
                    </td>
                    <td className="py-2 text-right font-medium text-char-900">
                      {formatMoney(line.amountCents, line.currency, locale)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <dl className="mt-4 space-y-1.5 border-t border-char-200 pt-4 text-sm">
              <Row
                label={t("costs.total")}
                value={
                  money.cost.totalEur !== null
                    ? formatMoney(money.cost.totalEur, "EUR", locale)
                    : formatMoney(money.cost.usdOnly, "USD", locale)
                }
                secondary={
                  money.cost.totalUsd !== null
                    ? formatMoney(money.cost.totalUsd, "USD", locale)
                    : null
                }
              />
              <Row
                label={t("costs.paid")}
                value={
                  money.paid.totalEur !== null
                    ? formatMoney(money.paid.totalEur, "EUR", locale)
                    : formatMoney(money.paid.usdOnly, "USD", locale)
                }
              />
              {money.settled ? (
                <p className="pt-1 font-semibold text-green-800">{t("costs.settled")}</p>
              ) : (
                money.balanceEur !== null && (
                  <Row
                    label={t("costs.balance")}
                    value={formatMoney(money.balanceEur, "EUR", locale)}
                    secondary={
                      money.balanceUsd !== null
                        ? formatMoney(money.balanceUsd, "USD", locale)
                        : null
                    }
                    strong
                  />
                )
              )}
            </dl>

            {/* Says which rate produced the euro figures, and when it was
                fixed. Without it a client comparing two visits would see the
                same car quoted differently and have no way to ask why. */}
            {order.usdToEurMicros && order.rateSetAt && (
              <p className="mt-3 text-xs text-char-500">
                {t("costs.rateNote", {
                  date: format.dateTime(order.rateSetAt, { dateStyle: "medium" }),
                  rate: formatRate(order.usdToEurMicros),
                })}
              </p>
            )}
          </>
        )}

        {payments.length > 0 && (
          <div className="mt-6 border-t border-char-200 pt-4">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-char-500">
              {t("payments.heading")}
            </h3>
            <ul className="mt-3 space-y-1.5 text-sm">
              {payments.map((p) => (
                <li key={p.id} className="flex justify-between gap-4">
                  <span className="text-char-600">
                    {format.dateTime(p.paidAt, { dateStyle: "medium" })} ·{" "}
                    {t(`payments.method.${p.method}`)}
                  </span>
                  <span className="font-medium text-char-900">
                    {formatMoney(p.amountCents, p.currency, locale)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}

function Fact({
  label,
  value,
  fallback = "—",
}: {
  label: string;
  value: string | null;
  fallback?: string;
}) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-char-500">{label}</dt>
      <dd className="mt-0.5 text-char-900">{value || fallback}</dd>
    </div>
  );
}

function Row({
  label,
  value,
  secondary,
  strong,
}: {
  label: string;
  value: string;
  secondary?: string | null;
  strong?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className={strong ? "font-semibold text-char-900" : "text-char-600"}>{label}</dt>
      <dd className={strong ? "font-semibold text-char-900" : "text-char-900"}>
        {value}
        {secondary && <span className="ml-2 text-xs font-normal text-char-500">{secondary}</span>}
      </dd>
    </div>
  );
}

function Gallery({
  files,
  label,
}: {
  files: Array<{ id: string; kind: string; url: string | null; fileName: string; caption: string | null }>;
  label: string;
}) {
  const photos = files.filter((f) => f.kind === "photo" && f.url);
  const videos = files.filter((f) => f.kind === "video" && f.url);
  const documents = files.filter((f) => f.kind === "document" && f.url);

  return (
    <div className="mt-3 space-y-3">
      {photos.length > 0 && (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {photos.map((file) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={file.id}
              src={file.url!}
              alt={file.caption ?? file.fileName}
              loading="lazy"
              className="aspect-[4/3] w-full rounded-lg object-cover"
            />
          ))}
        </div>
      )}

      {videos.map((file) => (
        // `preload="none"` matters here: these are 5–16 MB auction clips and
        // several can appear on one page. Preloading them would spend a
        // client's mobile data before they pressed anything.
        <video key={file.id} src={file.url!} controls preload="none" className="w-full rounded-lg" />
      ))}

      {documents.map((file) => (
        <a
          key={file.id}
          href={file.url!}
          className="inline-flex items-center gap-2 rounded-xl border border-char-200 px-3 py-2 text-sm font-medium text-char-800 transition-colors hover:border-amber-400 hover:text-amber-700"
        >
          <FileText size={16} />
          {file.caption || file.fileName}
          <DownloadSimple size={14} className="text-char-500" />
          <span className="sr-only">{label}</span>
        </a>
      ))}
    </div>
  );
}
