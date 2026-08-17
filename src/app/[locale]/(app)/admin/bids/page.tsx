import type { Metadata } from "next";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { Gavel, WarningCircle } from "@phosphor-icons/react/dist/ssr";
import LocalDateTime from "@/shared/time/LocalDateTime";
import { formatInstant } from "@/shared/time/formatInstant";
import { currentAdmin } from "@/modules/admin/model/currentAdmin";
import AdminSection from "@/modules/admin/components/AdminSection";
import BidDepositOverride from "@/modules/admin/components/BidDepositOverride";
import BidStatusActions from "@/modules/admin/components/BidStatusActions";
import {
  missedBidRequests,
  openBidRequests,
  withdrawnNeedingAttention,
  type BidRequestRow,
} from "@/modules/bids/model/bidRequests";
import { needsAnswer } from "@/modules/bids/model/bidStatus";
import { formatUsd } from "@/modules/plans/model/plans";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "AdminBids" });
  return { title: t("heading"), robots: { index: false } };
}

/**
 * What clients have asked us to bid on.
 *
 * ── THE GAP THIS CLOSES ─────────────────────────────────────────────────
 * A client could authorise a maximum bid from the lot page, and the row landed
 * in `bid_requests` where **nobody ever saw it**. Every piece around it was
 * written — the queue reads, the deposit override, its API route, the audit
 * trail, even the columns for who reviewed it and why — and none of it was
 * reachable, because there was no page. The same failure as the "client says
 * they have paid" signal, and worse in its consequence: a client who thinks we
 * are bidding for them tonight finds out weeks later that nobody was.
 *
 * ── THREE SECTIONS, ONE OF THEM AN ALARM ────────────────────────────────
 * `missed` goes FIRST and is red. It is every instruction we accepted and
 * never marked as placed, whose auction has already run. Nothing else on this
 * screen is a failure that has already happened, and it is invisible to
 * everyone until a client asks — so the page asks it out loud instead.
 *
 * Then the requests nobody has answered, then the ones already running. Split
 * because they are different jobs: the first has a person waiting for a reply.
 *
 * Both live lists come back sorted by the AUCTION clock, not by when they were
 * asked — see `openBidRequests`. A request made this morning for a sale next
 * week is not more urgent than one made ten minutes ago for a sale tonight.
 */
export default async function AdminBidsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const user = await currentAdmin();
  if (!user) notFound();

  const t = await getTranslations({ locale, namespace: "AdminBids" });
  const format = await getFormatter({ locale });

  const now = new Date();
  const [open, missed, withdrawn] = await Promise.all([
    openBidRequests(),
    missedBidRequests(now),
    withdrawnNeedingAttention(now),
  ]);

  // `missed` is a subset of `open` — an accepted instruction whose sale has
  // passed is still live. Listed once, at the top, where it is a problem
  // rather than a row.
  const missedIds = new Set(missed.map((row) => row.id));
  const waiting = open.filter((row) => needsAnswer(row.status));
  const running = open.filter((row) => !needsAnswer(row.status) && !missedIds.has(row.id));

  const empty = open.length === 0 && missed.length === 0 && withdrawn.length === 0;

  return (
    <div className="max-w-3xl">
      <h1 className="font-[family-name:var(--font-heading)] text-3xl font-extrabold tracking-tight text-char-900">
        {t("heading")}
      </h1>

      {empty ? (
        <div className="mt-8 flex flex-col items-center gap-2 rounded-2xl border border-char-200/70 bg-white py-12 text-center">
          <Gavel size={26} className="text-char-300" />
          <p className="text-sm text-char-600">{t("empty")}</p>
        </div>
      ) : (
        <div className="mt-8">
          {missed.length > 0 && (
            <AdminSection title={t("missedHeading")} count={missed.length}>
              <p className="-mt-2 mb-3 flex items-start gap-2 rounded-xl bg-red-50 px-4 py-3 text-sm leading-relaxed text-red-900">
                <WarningCircle size={17} weight="fill" className="mt-0.5 shrink-0 text-red-600" />
                {t("missedHint")}
              </p>
              <div className="space-y-3">
                {missed.map((row) => (
                  <Row key={row.id} row={row} locale={locale} t={t} format={format} now={now} alarm />
                ))}
              </div>
            </AdminSection>
          )}

          {/* Second, because a withdrawal we accepted carries the same class of
              danger as a missed one: the database says the instruction is gone
              and only the auction knows whether a bid is live. It also holds
              any deposit that was received, which would otherwise leave the
              queue while the money stayed with us. */}
          {withdrawn.length > 0 && (
            <AdminSection title={t("withdrawnHeading")} count={withdrawn.length}>
              <p className="-mt-2 mb-3 flex items-start gap-2 rounded-xl bg-amber-50 px-4 py-3 text-sm leading-relaxed text-char-800">
                <WarningCircle size={17} weight="fill" className="mt-0.5 shrink-0 text-amber-600" />
                {t("withdrawnHint")}
              </p>
              <div className="space-y-3">
                {withdrawn.map((row) => (
                  <Row key={row.id} row={row} locale={locale} t={t} format={format} now={now} />
                ))}
              </div>
            </AdminSection>
          )}

          {waiting.length > 0 && (
            <AdminSection title={t("waitingHeading")} count={waiting.length}>
              <div className="space-y-3">
                {waiting.map((row) => (
                  <Row key={row.id} row={row} locale={locale} t={t} format={format} now={now} />
                ))}
              </div>
            </AdminSection>
          )}

          {running.length > 0 && (
            <AdminSection title={t("runningHeading")} count={running.length}>
              <div className="space-y-3">
                {running.map((row) => (
                  <Row key={row.id} row={row} locale={locale} t={t} format={format} now={now} />
                ))}
              </div>
            </AdminSection>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * One instruction.
 *
 * The maximum bid is the largest thing on it, because it is the number the
 * admin is being asked to act on and the one they will type into BidManager by
 * hand. The sale time sits beside it: those two together are the whole
 * decision.
 */
function Row({
  row,
  locale,
  t,
  format,
  now,
  alarm = false,
}: {
  row: BidRequestRow;
  locale: string;
  t: (key: string, values?: Record<string, string | number | Date>) => string;
  format: Awaited<ReturnType<typeof getFormatter>>;
  now: Date;
  alarm?: boolean;
}) {
  const past = row.auctionAt !== null && row.auctionAt.getTime() <= now.getTime();

  return (
    <div
      className={`rounded-2xl border bg-white p-5 ${alarm ? "border-red-300" : "border-char-200/70"}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-2xl font-extrabold tabular-nums tracking-tight text-char-900">
            {formatUsd(row.maxBidUsdCents)}
            <span className="ml-2 text-sm font-semibold text-char-500">{t("maxBid")}</span>
          </p>

          {row.auctionAt ? (
            <p
              className={`mt-1 text-sm font-semibold ${past ? "text-red-700" : "text-char-600"}`}
            >
              {past ? t("saleWas") : t("saleAt")} {format.relativeTime(row.auctionAt, now)}{" "}
              <span className="font-normal text-char-400">
                <LocalDateTime
                  iso={row.auctionAt.toISOString()}
                  locale={locale}
                  fallback={formatInstant(row.auctionAt.toISOString(), locale, "UTC")}
                />
              </span>
            </p>
          ) : (
            <p className="mt-1 text-sm text-char-500">{t("saleUnknown")}</p>
          )}

          <p className="mt-2 truncate font-semibold text-char-800">{row.title}</p>
          <p className="truncate font-[family-name:var(--font-mono)] text-xs text-char-500">
            {row.platform} · {row.lotNumber}
            {row.vin ? ` · ${row.vin}` : ""}
          </p>
          <p className="mt-1.5 truncate text-sm text-char-700">
            {row.userName} — {row.userEmail}
          </p>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <span className="rounded-full bg-char-100 px-3 py-1 text-xs font-semibold text-char-700">
            {t(`status.${row.status}`)}
          </span>
          {/* The deposit's state, because accepting an instruction whose hold
              has not arrived is a decision, not an oversight — and the admin
              can only make it if the page says so. */}
          {row.depositRequiredCents > 0 && (
            <span
              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                row.depositStatus === "received"
                  ? "bg-green-50 text-green-800"
                  : "bg-amber-50 text-amber-800"
              }`}
            >
              {t(`deposit.status.${row.depositStatus}`, {
                amount: formatUsd(row.depositRequiredCents),
              })}
            </span>
          )}
        </div>
      </div>

      {/* What the client typed. Rendered plainly and never interpreted — it is
          the one part of this row that came from outside. */}
      {row.clientNote && (
        <p className="mt-3 rounded-xl bg-char-50 px-4 py-3 text-sm leading-relaxed text-char-700">
          {row.clientNote}
        </p>
      )}

      <BidStatusActions requestId={row.id} status={row.status} />

      <details className="mt-4 border-t border-char-100 pt-3">
        <summary className="cursor-pointer text-sm font-semibold text-char-600">
          {t("depositToggle")}
        </summary>
        <div className="mt-3">
          <BidDepositOverride
            requestId={row.id}
            defaultCents={row.depositDefaultCents}
            currentCents={row.depositRequiredCents}
          />
        </div>
      </details>
    </div>
  );
}
