"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { CheckCircle, WarningCircle } from "@phosphor-icons/react/dist/ssr";
import { errorBoxClass, inputClass, labelClass, submitClass, successBoxClass } from "./formStyles";

export default function ForgotPasswordForm() {
  const t = useTranslations("Auth.forgot");
  const locale = useLocale();
  const [status, setStatus] = useState<"idle" | "submitting" | "done" | "error">("idle");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("submitting");
    const data = Object.fromEntries(new FormData(e.currentTarget).entries());
    try {
      const res = await fetch("/api/auth/request-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, locale }),
      });
      setStatus(res.ok ? "done" : "error");
    } catch {
      setStatus("error");
    }
  }

  if (status === "done") {
    return (
      <p className={successBoxClass}>
        <CheckCircle size={18} weight="fill" className="shrink-0 text-green-600" />
        {t("checkInbox")}
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <label htmlFor="email" className={labelClass}>
          {t("email")}
        </label>
        <input id="email" name="email" type="email" autoComplete="email" required className={`mt-1.5 ${inputClass}`} />
      </div>
      <button type="submit" disabled={status === "submitting"} className={submitClass}>
        {status === "submitting" ? t("submitting") : t("submit")}
      </button>
      {status === "error" && (
        <p className={errorBoxClass}>
          <WarningCircle size={18} weight="fill" className="shrink-0 text-red-600" />
          {t("error")}
        </p>
      )}
    </form>
  );
}
