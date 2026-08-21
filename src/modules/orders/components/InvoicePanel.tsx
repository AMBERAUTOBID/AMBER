"use client";

import { useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { FilePdf, WarningCircle } from "@phosphor-icons/react/dist/ssr";

/**
 * The admin's invoice corner: what has been issued, and the one button.
 *
 * The list rows link straight to the download route — the admin checks what
 * the client will actually receive, not a re-render of it. The button POSTs
 * and reloads: issuing is rare enough that optimistic UI would only add ways
 * to show a number the database refused.
 *
 * The refusal reasons arrive as server codes and are translated here, so the
 * admin reads "no rate frozen", not HTTP 409.
 */

export interface InvoiceRow {
  id: string;
  number: string;
  totalCents: number;
  currency: string;
  issuedAt: string;
}

interface Props {
  orderId: string;
  invoices: InvoiceRow[];
}

export default function InvoicePanel({ orderId, invoices }: Props) {
  const t = useTranslations("Admin.invoice");
  const format = useFormatter();
  const [state, setState] = useState<"idle" | "busy">("idle");
  /** "" = the client's own account language — the default that needs no thought. */
  const [locale, setLocale] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function issue() {
    setState("busy");
    setError(null);
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/invoice`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(locale ? { locale } : {}),
      });
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      if (res.ok) {
        window.location.reload();
        return;
      }
      const reason = body?.error;
      setError(
        reason === "no_lines"
          ? t("needTotal")
          : reason === "two_currencies"
            ? t("needOneCurrency")
            : reason === "no_bank" || reason === "no_storage"
              ? t("needBank")
              : t("failed")
      );
    } catch {
      setError(t("failed"));
    }
    setState("idle");
  }

  return (
    <div>
      {invoices.length === 0 ? (
        <p className="text-sm text-char-500">{t("empty")}</p>
      ) : (
        <ul className="divide-y divide-char-100">
          {invoices.map((invoice) => (
            <li key={invoice.id} className="flex items-center gap-3 py-2.5">
              <FilePdf size={18} className="shrink-0 text-amber-700" />
              <a
                href={`/api/orders/${orderId}/invoices/${invoice.id}`}
                className="font-semibold text-char-900 underline-offset-4 hover:text-amber-700 hover:underline"
              >
                {invoice.number}
              </a>
              <span className="text-sm text-char-500">
                {t("issuedOn", {
                  date: format.dateTime(new Date(invoice.issuedAt), { dateStyle: "medium" }),
                })}
              </span>
              <span className="ml-auto text-sm font-semibold text-char-800">
                {(invoice.totalCents / 100).toLocaleString("en-US", {
                  minimumFractionDigits: 2,
                })}{" "}
                {invoice.currency}
              </span>
            </li>
          ))}
        </ul>
      )}

      {error ? (
        <p className="mt-3 flex items-center gap-2 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">
          <WarningCircle size={16} weight="fill" className="shrink-0" /> {error}
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <select
          value={locale}
          onChange={(e) => setLocale(e.target.value)}
          aria-label={t("language")}
          className="rounded-full border border-char-200 bg-white px-3 py-2 text-sm font-semibold text-char-700"
        >
          <option value="">{t("langAuto")}</option>
          <option value="lt">LT + EN</option>
          <option value="ru">RU + EN</option>
          <option value="en">EN</option>
        </select>
        <button
          type="button"
          onClick={issue}
          disabled={state === "busy"}
          className="inline-flex items-center gap-2 rounded-full bg-amber-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <FilePdf size={16} weight="bold" />
          {state === "busy" ? t("issuing") : t("issue")}
        </button>
        <p className="text-xs text-char-500">{t("frozenNote")}</p>
      </div>
    </div>
  );
}
