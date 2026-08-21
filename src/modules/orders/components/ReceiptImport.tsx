"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { FileArrowUp, WarningCircle } from "@phosphor-icons/react/dist/ssr";

/**
 * "Drop the Copart receipt here" — the thirty-second alternative to retyping
 * five money lines at three in the morning.
 *
 * Renders only while the file has no auction_price line: once priced, the
 * button disappears rather than sitting there as a way to double every fee
 * (the server refuses that too — this is manners, that is the guarantee).
 *
 * The refusal codes are the feature: "this receipt is for a different car"
 * arrives as a sentence, not as silently wrong cost lines.
 */

interface Props {
  orderId: string;
  /** True when an auction_price cost line already exists. */
  alreadyPriced: boolean;
}

export default function ReceiptImport({ orderId, alreadyPriced }: Props) {
  const t = useTranslations("Admin.receipt");
  const input = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<"idle" | "busy">("idle");
  const [error, setError] = useState<string | null>(null);

  if (alreadyPriced) return null;

  async function upload(file: File) {
    setState("busy");
    setError(null);
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/receipt`, {
        method: "POST",
        headers: { "Content-Type": "application/pdf" },
        body: file,
      });
      if (res.ok) {
        window.location.reload();
        return;
      }
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      const code = body?.error;
      setError(
        code === "wrong_platform"
          ? t("wrongPlatform")
          : code === "lot" || code === "vin"
            ? t("wrongCar")
            : code === "unreadable" || code === "sum_mismatch"
              ? t("unreadable")
              : code === "already_priced"
                ? t("alreadyPriced")
                : t("failed")
      );
    } catch {
      setError(t("failed"));
    }
    setState("idle");
  }

  return (
    <div className="mb-5 rounded-xl border border-dashed border-char-300 bg-char-50 p-4">
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
        accept="application/pdf"
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
  );
}
