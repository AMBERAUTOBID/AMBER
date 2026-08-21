"use client";

import { useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { CheckCircle, FileArrowUp, Warning, WarningCircle } from "@phosphor-icons/react/dist/ssr";
import { Link } from "@/i18n/navigation";
import { formatMoney } from "@/modules/orders/model/money";
import type { ResolvedCredit, StatementMatch } from "@/modules/orders/model/statementResolve";

/**
 * Upload the bank's CSV, see every incoming line matched to its file, book
 * each with one press — through the endpoints that already own those writes.
 *
 * The statement never leaves the browser except as one POST that returns a
 * preview; nothing about it is stored. Booking an order payment calls the
 * case file's own money endpoint with the fields prefilled — same guards,
 * same audit surface, minus the retyping. What cannot be prefilled honestly
 * is refused per row with the reason (unreadable date, foreign currency)
 * rather than guessed: a wrong `paidAt` back-dates a payment silently.
 */

interface Summary {
  credits: ResolvedCredit[];
  skippedDebits: number;
  skippedUnreadable: number;
  totalRows: number;
}

export default function StatementImport() {
  const t = useTranslations("AdminMoney.statement");
  const locale = useLocale();
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<"idle" | "busy">("idle");
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);

  async function upload(file: File) {
    setState("busy");
    setError(null);
    setSummary(null);
    try {
      const csv = await file.text();
      const res = await fetch("/api/admin/statement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv }),
      });
      const body = (await res.json().catch(() => null)) as
        | (Summary & { ok: true })
        | { ok: false; error?: string }
        | null;
      if (body?.ok) {
        setSummary(body);
      } else {
        const code = body?.error;
        setError(
          code === "no_amount_column"
            ? t("errNoAmount")
            : code === "empty" || code === "no_header"
              ? t("errEmpty")
              : code === "too_large"
                ? t("errTooLarge")
                : t("failed")
        );
      }
    } catch {
      setError(t("failed"));
    }
    setState("idle");
  }

  return (
    <div>
      <div className="rounded-xl border border-dashed border-char-300 bg-char-50 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => input.current?.click()}
            disabled={state === "busy"}
            className="inline-flex items-center gap-2 rounded-full border border-char-300 bg-white px-5 py-2.5 text-sm font-semibold text-char-800 transition-colors hover:border-amber-600 hover:text-amber-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <FileArrowUp size={16} weight="bold" />
            {state === "busy" ? t("importing") : t("import")}
          </button>
          <p className="text-xs text-char-500">{t("hint")}</p>
        </div>
        <input
          ref={input}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void upload(file);
            e.target.value = "";
          }}
        />
        {error ? (
          <p className="mt-3 flex items-center gap-2 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">
            <WarningCircle size={16} weight="fill" className="shrink-0" /> {error}
          </p>
        ) : null}
      </div>

      {summary && (
        <div className="mt-4">
          <p className="text-sm text-char-600">
            {t("summary", {
              credits: summary.credits.length,
              debits: summary.skippedDebits,
              unreadable: summary.skippedUnreadable,
            })}
          </p>
          <div className="mt-3 space-y-3">
            {summary.credits.map((credit) => (
              <CreditRow
                key={credit.line}
                credit={credit}
                locale={locale}
                t={t}
                onBooked={() => router.refresh()}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

type T = ReturnType<typeof useTranslations>;

function CreditRow({
  credit,
  locale,
  t,
  onBooked,
}: {
  credit: ResolvedCredit;
  locale: string;
  t: T;
  onBooked: () => void;
}) {
  return (
    <div className="rounded-2xl border border-char-200/70 bg-white p-4">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-lg font-extrabold tabular-nums tracking-tight text-char-900">
          {formatMoney(credit.amountCents, credit.currency === "EUR" ? "EUR" : "USD", locale)}
          {credit.currency !== "USD" && credit.currency !== "EUR" ? ` ${credit.currency}` : ""}
        </span>
        <span className="text-sm text-char-500">{credit.date ?? t("noDate")}</span>
        <span className="text-xs text-char-400">#{credit.line}</span>
      </div>
      <p className="mt-1 truncate text-sm text-char-600" title={credit.description}>
        {credit.description}
      </p>

      {credit.matches.length === 0 ? (
        <p className="mt-2 text-sm font-semibold text-char-500">{t("noReference")}</p>
      ) : (
        <div className="mt-2 space-y-2">
          {credit.matches.map((match, i) => (
            <MatchRow key={i} match={match} credit={credit} locale={locale} t={t} onBooked={onBooked} />
          ))}
        </div>
      )}
    </div>
  );
}

function MatchRow({
  match,
  credit,
  locale,
  t,
  onBooked,
}: {
  match: StatementMatch;
  credit: ResolvedCredit;
  locale: string;
  t: T;
  onBooked: () => void;
}) {
  const [state, setState] = useState<"idle" | "busy" | "done" | "failed">("idle");

  if (match.kind === "unknown") {
    return (
      <p className="flex items-center gap-2 text-sm text-char-500">
        <WarningCircle size={15} className="shrink-0" />
        {t("refNotFound", { reference: match.via })}
      </p>
    );
  }

  async function post(url: string, body?: unknown) {
    setState("busy");
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const json = (await res.json().catch(() => null)) as { ok?: boolean } | null;
      if (json?.ok) {
        setState("done");
        onBooked();
        return;
      }
    } catch {
      /* falls through to failed */
    }
    setState("failed");
  }

  const doneBadge = (
    <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-green-700">
      <CheckCircle size={15} weight="fill" /> {t("booked")}
    </span>
  );

  if (match.kind === "order") {
    // Only what can be prefilled HONESTLY is bookable: the money endpoint
    // needs a paid-at date and a USD/EUR currency, and inventing either is
    // exactly the silent mistake this preview exists to prevent.
    const bookable =
      credit.date !== null && (credit.currency === "USD" || credit.currency === "EUR");
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm">
        <Link
          href={`/admin/orders/${match.orderId}`}
          className="font-[family-name:var(--font-mono)] text-xs font-semibold text-char-700 underline-offset-2 hover:underline"
        >
          {match.via}
        </Link>
        <span className="text-char-700">{match.clientName}</span>
        <span className="text-char-500">
          {match.outstandingCents !== null
            ? t("outstanding", { amount: formatMoney(match.outstandingCents, match.currency, locale) })
            : t("notPriced")}
        </span>
        {match.duplicate && state !== "done" && (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
            <Warning size={13} weight="fill" /> {t("duplicate")}
          </span>
        )}
        {state === "done" ? (
          doneBadge
        ) : bookable ? (
          <button
            type="button"
            disabled={state === "busy"}
            onClick={() =>
              post(`/api/admin/orders/${match.orderId}/money`, {
                action: "addPayment",
                amountCents: credit.amountCents,
                currency: credit.currency,
                paidAt: `${credit.date}T00:00:00Z`,
                method: "bank_transfer",
                reference: match.via,
                note: credit.description.slice(0, 200),
              })
            }
            className="rounded-full bg-char-900 px-4 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-char-700 disabled:opacity-60"
          >
            {state === "busy" ? t("booking") : t("bookPayment")}
          </button>
        ) : (
          <span className="text-xs text-char-500">
            {credit.date === null ? t("bookNeedsDate") : t("bookBadCurrency", { currency: credit.currency })}
          </span>
        )}
        {state === "failed" && <span className="text-xs text-red-700">{t("bookFailed")}</span>}
      </div>
    );
  }

  if (match.kind === "container") {
    const mismatch = credit.amountCents !== match.freightCents;
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm">
        <span className="font-[family-name:var(--font-mono)] text-xs font-semibold text-char-700">
          {match.via}
        </span>
        <span className="text-char-700">{match.clientName}</span>
        <span className="text-char-500">
          {t("freight", { amount: formatMoney(match.freightCents, "USD", locale) })}
        </span>
        {match.paid || state === "done" ? (
          match.paid ? (
            <span className="text-sm font-semibold text-green-700">{t("freightPaid")}</span>
          ) : (
            doneBadge
          )
        ) : (
          <>
            {mismatch && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
                <Warning size={13} weight="fill" /> {t("freightMismatch")}
              </span>
            )}
            <button
              type="button"
              disabled={state === "busy"}
              onClick={() => post(`/api/admin/containers/${match.containerId}/paid`)}
              className="rounded-full bg-char-900 px-4 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-char-700 disabled:opacity-60"
            >
              {state === "busy" ? t("booking") : t("markFreightPaid")}
            </button>
          </>
        )}
        {state === "failed" && <span className="text-xs text-red-700">{t("bookFailed")}</span>}
      </div>
    );
  }

  // Deposits are LINKED, never booked from here: confirming one activates a
  // plan, and that judgment lives on the deposits queue with its own guards.
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm">
      <span className="font-[family-name:var(--font-mono)] text-xs font-semibold text-char-700">
        {match.via}
      </span>
      <span className="text-char-700">{match.clientName}</span>
      <span className="text-char-500">
        {t("deposit", { amount: formatMoney(match.amountCents, "USD", locale) })}
      </span>
      {match.status !== "pending" && (
        <span className="text-xs text-char-500">{t("depositNotPending")}</span>
      )}
      <Link
        href="/admin/deposits"
        className="rounded-full border border-char-300 px-4 py-1.5 text-xs font-semibold text-char-800 transition-colors hover:border-amber-600 hover:text-amber-700"
      >
        {t("openDeposits")}
      </Link>
    </div>
  );
}
