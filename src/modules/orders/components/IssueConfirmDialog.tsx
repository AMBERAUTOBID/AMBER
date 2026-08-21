"use client";

import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { ArrowSquareOut, FilePdf, Warning, X } from "@phosphor-icons/react/dist/ssr";

/**
 * The pause between "Išrašyti" and an invoice a client can see.
 *
 * Issuing is instant and irreversible by design — the document becomes
 * visible on the client's order page the moment the row exists, and a
 * mistake is corrected by issuing the NEXT number, never by editing. This
 * dialog is the owner's requested eyeball step: WHO is being invoiced, for
 * WHAT, in WHICH language, with the watermarked draft one click away — and
 * only then "continue".
 *
 * It renders facts handed to it and calls back; the actual issue stays in
 * the panel that owns the endpoint. A dialog that also POSTs would be a
 * second issue path to keep honest.
 */

export interface ConfirmRow {
  label: string;
  value: string;
}

export default function IssueConfirmDialog({
  rows,
  previewHref,
  busy,
  onConfirm,
  onClose,
}: {
  rows: ConfirmRow[];
  /** The watermarked-draft URL, opened in a new tab. */
  previewHref: string;
  busy: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const t = useTranslations("Admin.invoice");
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-char-900/50 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={t("confirmTitle")}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <h2 className="text-lg font-extrabold tracking-tight text-char-900">
            {t("confirmTitle")}
          </h2>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label={t("confirmCancel")}
            className="rounded-full p-1.5 text-char-500 transition-colors hover:bg-char-100 hover:text-char-800"
          >
            <X size={18} weight="bold" />
          </button>
        </div>

        <dl className="mt-4 space-y-2.5">
          {rows.map((row) => (
            <div key={row.label} className="flex items-baseline gap-3">
              <dt className="w-28 shrink-0 text-xs font-semibold uppercase tracking-wide text-char-500">
                {row.label}
              </dt>
              <dd className="min-w-0 break-words text-sm font-semibold text-char-900">
                {row.value}
              </dd>
            </div>
          ))}
        </dl>

        <a
          href={previewHref}
          target="_blank"
          rel="noreferrer"
          className="mt-4 inline-flex items-center gap-2 rounded-full border border-char-300 px-4 py-2 text-sm font-semibold text-char-800 transition-colors hover:border-amber-600 hover:text-amber-700"
        >
          <FilePdf size={16} weight="bold" />
          {t("preview")}
          <ArrowSquareOut size={14} />
        </a>

        {/* The consequence, before the click that causes it. */}
        <p className="mt-4 flex items-start gap-2 rounded-xl bg-amber-50 px-4 py-3 text-sm text-char-800">
          <Warning size={17} weight="fill" className="mt-0.5 shrink-0 text-amber-600" />
          {t("confirmNote")}
        </p>

        <div className="mt-5 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-full border border-char-300 px-5 py-2.5 text-sm font-semibold text-char-800 transition-colors hover:bg-char-50 disabled:opacity-60"
          >
            {t("confirmCancel")}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-full bg-amber-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <FilePdf size={16} weight="bold" />
            {busy ? t("issuing") : t("confirmGo")}
          </button>
        </div>
      </div>
    </div>
  );
}
