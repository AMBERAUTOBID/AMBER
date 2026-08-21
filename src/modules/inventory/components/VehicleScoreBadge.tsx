"use client";

import { useEffect, useState } from "react";
import { Info, ArrowSquareOut, X } from "@phosphor-icons/react/dist/ssr";

/**
 * IAAI's Vehicle Score, shown as "35/50" with an explainer the client can
 * actually read.
 *
 * The number is IAAI's own automated 0–50 condition score — Copart has no
 * such thing, which is why the label everywhere names IAAI. The owner's call
 * 2026-08-21: a bare "35" told a client nothing, and sending them to IAAI's
 * English marketing page (written for their subscribers) explained little
 * more — so the explanation lives here, in the visitor's language, with the
 * IAAI source linked for anyone who wants the original.
 *
 * The scale facts in the modal come from that IAAI page, read 2026-08-21:
 * 0–50, where 0–9 is non-repairable and 50 is little damage; scored on body
 * panels, drivability, airbags and additional damage. If the modal copy ever
 * needs changing, change it against that source, not from memory.
 */
const IAAI_SCORE_URL = "https://www.iaai.com/Buying-Services/iaa-vehicle-score";

export default function VehicleScoreBadge({
  raw,
  labels,
}: {
  /** The score exactly as IAAI's data carries it, e.g. "35". */
  raw: string;
  labels: {
    title: string;
    intro: string;
    scaleHigh: string;
    scaleLow: string;
    factors: string;
    copartNote: string;
    source: string;
    close: string;
  };
}) {
  const [open, setOpen] = useState(false);

  // "/50" only when the value really is a number on IAAI's scale — an odd
  // string passes through untouched rather than gaining a denominator it
  // never had.
  const n = Number(raw);
  const display = Number.isFinite(n) && n >= 0 && n <= 50 ? `${n}/50` : raw;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 font-semibold text-char-900 underline decoration-char-300 decoration-dotted underline-offset-2 transition-colors hover:text-amber-700"
      >
        {display}
        <Info size={14} className="text-char-400" />
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={labels.title}
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-char-900/80 p-4 backdrop-blur-sm"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            // `text-left` is load-bearing: this dialog renders inside the spec
            // table's VALUE cell, which right-aligns — a fixed-position child
            // still inherits text-align, and the owner got a ragged modal.
            className="w-full max-w-md rounded-2xl bg-white p-6 text-left"
          >
            <div className="flex items-start justify-between gap-4">
              <p className="font-bold text-char-900">{labels.title}</p>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label={labels.close}
                className="-m-1 rounded-lg p-1 text-char-500 transition-colors hover:text-char-900"
              >
                <X size={18} />
              </button>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-char-700">{labels.intro}</p>
            <ul className="mt-3 space-y-1.5 text-sm text-char-700">
              <li className="flex gap-2">
                <span className="font-semibold text-emerald-700">50</span>
                <span>{labels.scaleHigh}</span>
              </li>
              <li className="flex gap-2">
                <span className="font-semibold text-red-700">0–9</span>
                <span>{labels.scaleLow}</span>
              </li>
            </ul>
            <p className="mt-3 text-sm leading-relaxed text-char-700">{labels.factors}</p>
            <p className="mt-3 text-xs text-char-500">{labels.copartNote}</p>
            <a
              href={IAAI_SCORE_URL}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-amber-700 hover:text-amber-800"
            >
              {labels.source}
              <ArrowSquareOut size={14} weight="bold" />
            </a>
          </div>
        </div>
      )}
    </>
  );
}
