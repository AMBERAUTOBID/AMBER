"use client";

import { useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { CheckCircle, Eye, FilePdf, Package, WarningCircle } from "@phosphor-icons/react/dist/ssr";
import { inputClass, labelClass } from "@/modules/auth/components/formStyles";
import { parseAmountToCents } from "@/modules/orders/model/money";
import IssueConfirmDialog from "./IssueConfirmDialog";

/**
 * The dedicated-container corner of an admin's case file.
 *
 * Two states, one component. No container yet: the create form — tick which
 * of the client's cars ride along, type the phone-deal sum and the due date,
 * and the negotiated number is frozen in the system the same hour the call
 * ends. Container exists: its facts, the freight invoice button, and "mark
 * paid" — the fact the loading decision reads.
 */

export interface LinkableOrder {
  id: string;
  reference: string;
  title: string;
}

export interface ContainerInfo {
  id: string;
  reference: string;
  containerType: string;
  freightCents: number;
  dueAt: string;
  paidAt: string | null;
  invoices: { id: string; number: string; issuedAt: string }[];
}

interface Props {
  orderId: string;
  container: ContainerInfo | null;
  /** The client's other case files not yet in any container (current first). */
  linkable: LinkableOrder[];
  /** Who pays the freight — the confirmation dialog's first fact. */
  clientName: string;
  clientEmail: string;
  clientLocale: string;
}

export default function ContainerPanel({
  orderId,
  container,
  linkable,
  clientName,
  clientEmail,
  clientLocale,
}: Props) {
  const t = useTranslations("Admin.container");
  const tInvoiceLang = useTranslations("Admin.invoice");
  const format = useFormatter();

  const [selected, setSelected] = useState<Set<string>>(() => new Set([orderId]));
  const [sum, setSum] = useState("");
  const [due, setDue] = useState("");
  const [type, setType] = useState("40ft");
  const [note, setNote] = useState("");
  const [state, setState] = useState<"idle" | "busy">("idle");
  const [error, setError] = useState<string | null>(null);
  const [invoiceLocale, setInvoiceLocale] = useState("");
  const [confirming, setConfirming] = useState(false);

  const money = (cents: number) =>
    (cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2 }) + " USD";

  async function create(e: React.FormEvent) {
    e.preventDefault();
    const freightCents = parseAmountToCents(sum);
    if (freightCents === null || freightCents <= 0 || !due) {
      setError(t("badInput"));
      return;
    }
    setState("busy");
    setError(null);
    try {
      const res = await fetch("/api/admin/containers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderIds: [...selected],
          freightCents,
          dueAt: new Date(`${due}T12:00:00Z`).toISOString(),
          containerType: type,
          note: note.trim() || null,
        }),
      });
      if (res.ok) {
        window.location.reload();
        return;
      }
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      setError(body?.error === "mixed_owners" ? t("mixedOwners") : t("failed"));
    } catch {
      setError(t("failed"));
    }
    setState("idle");
  }

  async function act(path: string, needBankAware: boolean, body?: object) {
    setState("busy");
    setError(null);
    try {
      const res = await fetch(path, {
        method: "POST",
        ...(body
          ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
          : {}),
      });
      if (res.ok) {
        window.location.reload();
        return;
      }
      const reply = (await res.json().catch(() => null)) as { error?: string } | null;
      setError(needBankAware && reply?.error === "no_bank" ? t("needBank") : t("failed"));
    } catch {
      setError(t("failed"));
    }
    setState("idle");
  }

  if (container) {
    return (
      <div>
        <div className="flex flex-wrap items-center gap-3">
          <Package size={22} className="text-char-500" />
          <span className="font-mono text-sm font-bold text-char-900">{container.reference}</span>
          <span className="text-sm text-char-500">{container.containerType}</span>
          <span className="text-sm font-semibold text-char-900">
            {money(container.freightCents)}
          </span>
          {container.paidAt ? (
            <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-700">
              <CheckCircle size={13} weight="fill" />
              {t("paidOn", {
                date: format.dateTime(new Date(container.paidAt), { dateStyle: "medium" }),
              })}
            </span>
          ) : (
            <span className="rounded-lg bg-amber-50 px-2 py-0.5 text-xs font-bold text-amber-800">
              {t("dueOn", {
                date: format.dateTime(new Date(container.dueAt), { dateStyle: "medium" }),
              })}
            </span>
          )}
        </div>

        {container.invoices.length > 0 ? (
          <ul className="mt-3 space-y-1.5">
            {container.invoices.map((invoice) => (
              <li key={invoice.id} className="flex items-center gap-2 text-sm">
                <FilePdf size={16} className="text-amber-700" />
                <a
                  href={`/api/containers/${container.id}/invoices/${invoice.id}`}
                  className="font-semibold text-char-900 underline-offset-4 hover:text-amber-700 hover:underline"
                >
                  {invoice.number}
                </a>
                <span className="text-xs text-char-500">
                  {format.dateTime(new Date(invoice.issuedAt), { dateStyle: "medium" })}
                </span>
              </li>
            ))}
          </ul>
        ) : null}

        {error ? (
          <p className="mt-3 flex items-center gap-2 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">
            <WarningCircle size={16} weight="fill" className="shrink-0" /> {error}
          </p>
        ) : null}

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <select
            value={invoiceLocale}
            onChange={(e) => setInvoiceLocale(e.target.value)}
            aria-label={tInvoiceLang("language")}
            className="rounded-full border border-char-200 bg-white px-3 py-2 text-sm font-semibold text-char-700"
          >
            <option value="">{tInvoiceLang("langAuto")}</option>
            <option value="lt">LT + EN</option>
            <option value="ru">RU + EN</option>
            <option value="en">EN</option>
          </select>
          <a
            href={`/api/admin/containers/${container.id}/invoice/preview${
              invoiceLocale ? `?locale=${invoiceLocale}` : ""
            }`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-full border border-char-300 px-5 py-2.5 text-sm font-semibold text-char-800 transition-colors hover:border-amber-600 hover:text-amber-700"
          >
            <Eye size={16} weight="bold" />
            {tInvoiceLang("preview")}
          </a>
          <button
            type="button"
            disabled={state === "busy"}
            onClick={() => setConfirming(true)}
            className="inline-flex items-center gap-2 rounded-full bg-amber-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <FilePdf size={16} weight="bold" />
            {state === "busy" ? t("issuing") : t("issue")}
          </button>
          {confirming && (
            <IssueConfirmDialog
              rows={[
                {
                  label: tInvoiceLang("confirmClient"),
                  value: `${clientName} · ${clientEmail}`,
                },
                {
                  label: tInvoiceLang("confirmContainer"),
                  value: `${container.reference} · ${container.containerType}`,
                },
                { label: tInvoiceLang("confirmTotal"), value: money(container.freightCents) },
                {
                  label: t("due"),
                  value: format.dateTime(new Date(container.dueAt), { dateStyle: "medium" }),
                },
                {
                  label: tInvoiceLang("language"),
                  value:
                    invoiceLocale === ""
                      ? `${tInvoiceLang("langAuto")} (${clientLocale.toUpperCase()})`
                      : invoiceLocale.toUpperCase(),
                },
              ]}
              previewHref={`/api/admin/containers/${container.id}/invoice/preview${
                invoiceLocale ? `?locale=${invoiceLocale}` : ""
              }`}
              busy={state === "busy"}
              onConfirm={() =>
                void act(
                  `/api/admin/containers/${container.id}/invoice`,
                  true,
                  invoiceLocale ? { locale: invoiceLocale } : {}
                  // Closed after the attempt either way: success reloads the
                  // page, failure must reveal the error box behind the dialog.
                ).then(() => setConfirming(false))
              }
              onClose={() => setConfirming(false)}
            />
          )}
          {!container.paidAt && container.invoices.length > 0 ? (
            <button
              type="button"
              disabled={state === "busy"}
              onClick={() => act(`/api/admin/containers/${container.id}/paid`, false)}
              className="inline-flex items-center gap-2 rounded-full border border-emerald-600 px-5 py-2.5 text-sm font-semibold text-emerald-700 transition-colors hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <CheckCircle size={16} weight="bold" />
              {t("markPaid")}
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={create}>
      <p className="text-sm text-char-500">{t("none")}</p>

      <div className="mt-4">
        <span className={labelClass}>{t("carsLabel")}</span>
        <ul className="mt-2 space-y-1.5">
          {linkable.map((order) => (
            <li key={order.id}>
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-amber-600"
                  checked={selected.has(order.id)}
                  disabled={order.id === orderId}
                  onChange={(e) => {
                    setSelected((prev) => {
                      const next = new Set(prev);
                      if (e.target.checked) next.add(order.id);
                      else next.delete(order.id);
                      return next;
                    });
                  }}
                />
                <span className="font-mono text-xs text-char-500">{order.reference}</span>
                <span className="text-char-800">{order.title}</span>
              </label>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <div>
          <label htmlFor="cnt-sum" className={labelClass}>
            {t("sum")}
          </label>
          <input
            id="cnt-sum"
            className={inputClass}
            value={sum}
            onChange={(e) => setSum(e.target.value)}
            placeholder="3 200.00"
            inputMode="decimal"
          />
          <p className="mt-1 text-xs text-char-500">{t("sumHint")}</p>
        </div>
        <div>
          <label htmlFor="cnt-due" className={labelClass}>
            {t("due")}
          </label>
          <input
            id="cnt-due"
            type="date"
            className={inputClass}
            value={due}
            onChange={(e) => setDue(e.target.value)}
          />
          <p className="mt-1 text-xs text-char-500">{t("dueHint")}</p>
        </div>
        <div>
          <label htmlFor="cnt-type" className={labelClass}>
            {t("typeLabel")}
          </label>
          <input
            id="cnt-type"
            className={inputClass}
            value={type}
            onChange={(e) => setType(e.target.value)}
          />
        </div>
        <div className="sm:col-span-3">
          <label htmlFor="cnt-note" className={labelClass}>
            {t("note")}
          </label>
          <input
            id="cnt-note"
            className={inputClass}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
      </div>

      {error ? (
        <p className="mt-3 flex items-center gap-2 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">
          <WarningCircle size={16} weight="fill" className="shrink-0" /> {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={state === "busy"}
        className="mt-4 inline-flex items-center gap-2 rounded-full bg-amber-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <Package size={16} weight="bold" />
        {state === "busy" ? t("creating") : t("create")}
      </button>
    </form>
  );
}
