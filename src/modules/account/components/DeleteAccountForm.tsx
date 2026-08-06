"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { WarningCircle } from "@phosphor-icons/react/dist/ssr";
import { inputClass, labelClass, errorBoxClass } from "@/modules/auth/components/formStyles";

type State = "idle" | "confirming" | "busy" | "invalid_password" | "error";

/**
 * "Delete my account" — the GDPR right to erasure, self-service.
 *
 * Three deliberate frictions, because this is the only irreversible action a
 * client has: it starts collapsed behind a link rather than sitting open as a
 * red button, it states plainly what survives and what doesn't, and it asks
 * for the password. A session left open on a shared laptop must not be enough
 * to erase somebody's account.
 *
 * The copy says the deposit records are kept. Saying "everything is deleted"
 * would be simpler and false, and this is exactly the promise a person is
 * entitled to have kept precisely.
 */
export default function DeleteAccountForm() {
  const t = useTranslations("Account.details");
  const locale = useLocale();
  const [state, setState] = useState<State>("idle");
  const [password, setPassword] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState("busy");
    try {
      const res = await fetch("/api/account/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        // Full navigation home. The session is gone server-side and the
        // cookie cleared, so every subsequent render must come from a server
        // that no longer knows this person.
        window.location.assign(locale === "en" ? "/" : `/${locale}`);
        return;
      }
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      setState(body.error === "invalid_password" ? "invalid_password" : "error");
    } catch {
      setState("error");
    }
  }

  if (state === "idle") {
    return (
      <button
        type="button"
        onClick={() => setState("confirming")}
        className="text-sm font-semibold text-char-600 underline-offset-4 transition-colors hover:text-red-700 hover:underline"
      >
        {t("deleteAccount")}
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="rounded-xl border border-red-200 bg-red-50/50 p-4">
      <p className="text-sm font-semibold text-char-900">{t("deleteHeading")}</p>
      <p className="mt-2 text-sm leading-relaxed text-char-700">{t("deleteExplainer")}</p>
      {/* Named separately from the explainer so the one irreversible fact
          isn't buried in a paragraph someone skims. */}
      <p className="mt-2 text-sm font-semibold leading-relaxed text-red-800">
        {t("deleteIrreversible")}
      </p>

      <div className="mt-4">
        <label htmlFor="delete-password" className={labelClass}>
          {t("deleteConfirmPassword")}
        </label>
        <input
          id="delete-password"
          type="password"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            if (state === "invalid_password" || state === "error") setState("confirming");
          }}
          required
          autoComplete="current-password"
          className={`mt-1.5 ${inputClass}`}
        />
      </div>

      {(state === "invalid_password" || state === "error") && (
        <p className={`mt-3 ${errorBoxClass}`}>
          <WarningCircle size={18} weight="fill" className="shrink-0" />
          {state === "invalid_password" ? t("currentPasswordWrong") : t("saveError")}
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={state === "busy"}
          className="rounded-full bg-red-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:opacity-60"
        >
          {state === "busy" ? t("deleting") : t("deleteYes")}
        </button>
        <button
          type="button"
          onClick={() => {
            setPassword("");
            setState("idle");
          }}
          disabled={state === "busy"}
          className="text-sm font-semibold text-char-600 underline-offset-4 hover:underline disabled:opacity-60"
        >
          {t("deleteNo")}
        </button>
      </div>
    </form>
  );
}
