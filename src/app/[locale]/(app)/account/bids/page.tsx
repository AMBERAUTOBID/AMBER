import type { Metadata } from "next";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import {
  Gavel,
  ClockCounterClockwise,
  WhatsappLogo,
  EnvelopeSimple,
  XCircle,
  CheckCircle,
  Hourglass,
} from "@phosphor-icons/react/dist/ssr";
import { Link } from "@/i18n/navigation";
import LocalDateTime from "@/shared/time/LocalDateTime";
import { formatInstant } from "@/shared/time/formatInstant";
import { requireUser } from "@/modules/account/model/requireUser";
import { whatsappHref, CONTACT_HREF, SITE } from "@/shared/config/site";
import { bidRequestsFor, type BidRequestRow } from "@/modules/bids/model/bidRequests";
import { canClientWithdraw, isLiveInstruction } from "@/modules/bids/model/bidStatus";
import { bidWindow } from "@/modules/bids/model/bidWindow";
import WithdrawBidButton from "@/modules/bids/components/WithdrawBidButton";
import { formatUsd } from "@/modules/plans/model/plans";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Bids" });
  return { title: t("title"), robots: { index: false } };
}

/**
 * A client's own bid instructions, and what came of each.
 *
 * ── WHY THIS PAGE STOPPED BEING A PLACEHOLDER ───────────────────────────
 * It shipped empty in 2026-08-06 as a signpost, back when bidding really did
 * happen over WhatsApp. Since `11af96a` an admin can accept a request, mark a
 * bid placed, record a win — **and refuse one, in writing** — and none of it
 * reached the person it was about. A refusal written for the client and shown
 * to nobody is worse than no refusal at all: the console says they were told.
 *
 * ── THE STATUS IS NEVER SHOWN ON ITS OWN ────────────────────────────────
 * Every row carries a sentence saying what the state MEANS and what happens
 * next. "Accepted" is not information to somebody who has authorised us to
 * spend twelve thousand dollars of their money; "we will bid for you, there is
 * nothing more to do" is. The badge is for scanning, the sentence is the
 * answer, and a refusal shows the admin's own words rather than a generic
 * apology.
 *
 * The active/history split is the one the placeholder already chose, and it
 * was right: a bid you can still act on is a different thing from a record of
 * one that closed. `isLiveInstruction` draws the line from the same constant
 * the plan's concurrency limit uses, so the list and the allowance agree.
 */
export default async function AccountBidsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireUser(locale, "/account/bids");

  const t = await getTranslations({ locale, namespace: "Bids" });
  const format = await getFormatter({ locale });

  // Scoped to the person asking, in the query. Nothing here filters afterwards.
  const rows = await bidRequestsFor(user.id);
  const now = new Date();

  /**
   * Two lists, two orders, and the difference is the point.
   *
   * **Live instructions sort by the auction clock**, soonest first — the same
   * reasoning `openBidRequests` gives for the admin queue: a car selling
   * tonight is more urgent than one selling next week, however long ago each
   * was asked for. Lots with no known sale date go last; nothing is expiring.
   *
   * **History stays newest-first**, as `bidRequestsFor` returns it, because a
   * finished bid has no clock left and the only useful order is what happened
   * most recently.
   */
  const live = rows
    .filter((row) => isLiveInstruction(row.status))
    .sort((a, b) => {
      const left = a.auctionAt?.getTime() ?? null;
      const right = b.auctionAt?.getTime() ?? null;
      if (left === null && right === null) return 0;
      if (left === null) return 1;
      if (right === null) return -1;
      return left - right;
    });
  const finished = rows.filter((row) => !isLiveInstruction(row.status));

  return (
    <div className="max-w-2xl">
      <h1 className="font-[family-name:var(--font-heading)] text-3xl font-extrabold tracking-tight text-char-900">
        {t("title")}
      </h1>

      <section className="mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-char-500">
          {t("activeHeading")}
        </h2>
        {live.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-char-200/70 bg-white p-6">
            <div className="flex flex-col items-center gap-2 py-4 text-center">
              <Gavel size={26} className="text-char-300" />
              <p className="text-sm text-char-600">{t("activeEmpty")}</p>
            </div>
            {/* The two real channels stay, but as a fallback rather than as the
                main route: the button on a car's own page is the way now, and
                this is for somebody who cannot find the car. */}
            <div className="mt-4 flex flex-wrap items-center justify-center gap-3 border-t border-char-100 pt-4">
              <Link
                href="/search"
                className="inline-flex items-center gap-2 rounded-full bg-amber-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-amber-700"
              >
                <Gavel size={17} weight="fill" />
                {t("findCar")}
              </Link>
              <a
                href={whatsappHref(t("whatsappPrefill"))}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-full border border-char-200 bg-white px-5 py-2.5 text-sm font-semibold text-char-800 transition-colors hover:border-amber-400 hover:text-amber-700"
              >
                <WhatsappLogo size={17} weight="fill" />
                {t("whatsappCta")}
              </a>
              <a
                href={CONTACT_HREF.email}
                className="inline-flex items-center gap-2 rounded-full border border-char-200 bg-white px-5 py-2.5 text-sm font-semibold text-char-800 transition-colors hover:border-amber-400 hover:text-amber-700"
              >
                <EnvelopeSimple size={17} weight="fill" />
                {t("emailCta")}
              </a>
            </div>
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {live.map((row) => (
              <Row key={row.id} row={row} locale={locale} t={t} format={format} now={now} />
            ))}
          </div>
        )}
      </section>

      <section className="mt-10">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-char-500">
          {t("historyHeading")}
        </h2>
        {finished.length === 0 ? (
          <div className="mt-4 flex flex-col items-center gap-2 rounded-2xl border border-char-200/70 bg-white py-10 text-center">
            <ClockCounterClockwise size={26} className="text-char-300" />
            <p className="text-sm text-char-600">{t("historyEmpty")}</p>
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {finished.map((row) => (
              <Row key={row.id} row={row} locale={locale} t={t} format={format} now={now} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

/** How loudly a state is drawn. Only a refusal and a win are worth colour. */
const TONE: Record<string, string> = {
  declined: "border-red-200 bg-red-50/50",
  won: "border-green-200 bg-green-50/50",
};

function Row({
  row,
  locale,
  t,
  format,
  now,
}: {
  row: BidRequestRow;
  locale: string;
  t: (key: string, values?: Record<string, string | number | Date>) => string;
  format: Awaited<ReturnType<typeof getFormatter>>;
  now: Date;
}) {
  const past = row.auctionAt !== null && row.auctionAt.getTime() <= now.getTime();

  return (
    <article className={`rounded-2xl border p-5 ${TONE[row.status] ?? "border-char-200/70 bg-white"}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-semibold text-char-900">{row.title}</p>
          <p className="truncate font-[family-name:var(--font-mono)] text-xs text-char-500">
            {row.platform} · {row.lotNumber}
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-white/70 px-3 py-1 text-xs font-semibold text-char-700 ring-1 ring-char-200">
          {t(`status.${row.status}`)}
        </span>
      </div>

      {/* THE ANSWER. A status word is not one — this is the sentence that says
          what it means and what, if anything, the client has to do. */}
      <p className="mt-3 flex items-start gap-2 text-sm leading-relaxed text-char-700">
        <Icon status={row.status} />
        <span>{t(`meaning.${row.status}`)}</span>
      </p>

      {/* Our own words, quoted back. Never replaced by a generic apology: the
          admin wrote this for this client about this car. */}
      {row.status === "declined" && row.declineReason && (
        <blockquote className="mt-3 rounded-xl border-l-4 border-red-300 bg-white/70 px-4 py-3 text-sm leading-relaxed text-char-800">
          {row.declineReason}
        </blockquote>
      )}

      {row.status === "won" && row.orderId && (
        <Link
          href={`/account/orders/${row.orderId}`}
          className="mt-3 inline-block text-sm font-semibold text-amber-700 underline-offset-4 hover:underline"
        >
          {t("openFile")} →
        </Link>
      )}

      {/* Taking it back. The rule is re-checked on the server — this only
          decides what to draw, and the two must agree, so both read
          `canClientWithdraw`. Inside the window it is a phone number rather
          than a disabled button: at that point a person here can still find
          out whether a bid is live at the auction, and a form cannot. */}
      {isLiveInstruction(row.status) &&
        row.status !== "placed" &&
        (canClientWithdraw(row.status, bidWindow(row.auctionAt, now).state) ? (
          <WithdrawBidButton
            requestId={row.id}
            labels={{
              action: t("withdraw.action"),
              confirmTitle: t("withdraw.confirmTitle"),
              confirmBody: t("withdraw.confirmBody", {
                car: row.title,
                amount: formatUsd(row.maxBidUsdCents),
              }),
              confirmYes: t("withdraw.confirmYes"),
              confirmNo: t("withdraw.confirmNo"),
              working: t("withdraw.working"),
              tooLate: t("withdraw.tooLate", { phone: SITE.phone.display }),
              failed: t("withdraw.failed"),
            }}
          />
        ) : (
          <p className="mt-3 text-sm leading-relaxed text-char-600">
            {t("withdraw.callInstead")}{" "}
            <a
              href={CONTACT_HREF.tel}
              className="font-semibold text-amber-700 underline-offset-4 hover:underline"
            >
              {SITE.phone.display}
            </a>
          </p>
        ))}

      <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 border-t border-char-100 pt-3 text-sm">
        <div>
          <dt className="text-xs uppercase tracking-wider text-char-500">{t("yourMax")}</dt>
          <dd className="mt-0.5 font-bold tabular-nums text-char-900">
            {formatUsd(row.maxBidUsdCents)}
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wider text-char-500">
            {past ? t("saleWas") : t("saleAt")}
          </dt>
          <dd className="mt-0.5 text-char-800">
            {row.auctionAt ? (
              <LocalDateTime
                iso={row.auctionAt.toISOString()}
                locale={locale}
                fallback={formatInstant(row.auctionAt.toISOString(), locale, "UTC")}
              />
            ) : (
              t("saleUnknown")
            )}
          </dd>
        </div>
        {/* Shown only while it is still a live commitment. Reminding somebody
            about a hold on a bid they lost three weeks ago is noise. */}
        {row.depositRequiredCents > 0 && isLiveInstruction(row.status) && (
          <div>
            <dt className="text-xs uppercase tracking-wider text-char-500">{t("deposit")}</dt>
            <dd className="mt-0.5 text-char-800">
              {t(`depositStatus.${row.depositStatus}`, {
                amount: formatUsd(row.depositRequiredCents),
              })}
            </dd>
          </div>
        )}
        <div>
          <dt className="text-xs uppercase tracking-wider text-char-500">{t("asked")}</dt>
          <dd className="mt-0.5 text-char-800">
            {format.dateTime(row.createdAt, { dateStyle: "medium" })}
          </dd>
        </div>
      </dl>
    </article>
  );
}

function Icon({ status }: { status: BidRequestRow["status"] }) {
  const shared = "mt-0.5 shrink-0";
  if (status === "declined")
    return <XCircle size={17} weight="fill" className={`${shared} text-red-600`} />;
  if (status === "won")
    return <CheckCircle size={17} weight="fill" className={`${shared} text-green-600`} />;
  if (status === "cancelled" || status === "lost")
    return <ClockCounterClockwise size={17} className={`${shared} text-char-500`} />;
  return <Hourglass size={17} weight="fill" className={`${shared} text-amber-500`} />;
}
