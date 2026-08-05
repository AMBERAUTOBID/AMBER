"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { CheckCircle, WarningCircle } from "@phosphor-icons/react/dist/ssr";
import { errorBoxClass, inputClass, labelClass, submitClass, successBoxClass } from "./formStyles";
// The policy module, not model/password — that one imports node:crypto.
import { MIN_PASSWORD_LENGTH } from "../model/passwordPolicy";

type Status = "idle" | "submitting" | "done";
type ErrorKind = "invalid_email" | "invalid_password" | "invalid_name" | "rate_limited" | "generic";

export default function RegisterForm() {
  const t = useTranslations("Auth.register");
  const locale = useLocale();
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<ErrorKind | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("submitting");
    setError(null);
    const data = Object.fromEntries(new FormData(e.currentTarget).entries());
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, locale }),
      });
      if (res.ok) {
        // "done" regardless of whether the email was new — the server keeps
        // that secret on purpose, and the next step is the inbox either way.
        setStatus("done");
        return;
      }
      const body = (await res.json().catch(() => ({}))) as { error?: string; field?: string };
      if (body.error === "rate_limited") setError("rate_limited");
      else if (body.field === "email") setError("invalid_email");
      else if (body.field === "password") setError("invalid_password");
      else if (body.field === "name") setError("invalid_name");
      else setError("generic");
    } catch {
      setError("generic");
    }
    if (status !== "done") setStatus("idle");
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
        <label htmlFor="name" className={labelClass}>
          {t("name")}
        </label>
        <input id="name" name="name" type="text" autoComplete="name" required className={`mt-1.5 ${inputClass}`} />
      </div>
      <div>
        <label htmlFor="email" className={labelClass}>
          {t("email")}
        </label>
        <input id="email" name="email" type="email" autoComplete="email" required className={`mt-1.5 ${inputClass}`} />
      </div>
      <div>
        <label htmlFor="phone" className={labelClass}>
          {t("phone")}
        </label>
        <input id="phone" name="phone" type="tel" autoComplete="tel" className={`mt-1.5 ${inputClass}`} />
      </div>
      <div>
        <label htmlFor="password" className={labelClass}>
          {t("password")}
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={MIN_PASSWORD_LENGTH}
          className={`mt-1.5 ${inputClass}`}
        />
        <p className="mt-1.5 text-xs text-char-500">{t("passwordHint")}</p>
      </div>

      <button type="submit" disabled={status === "submitting"} className={submitClass}>
        {status === "submitting" ? t("submitting") : t("submit")}
      </button>

      {error && (
        <p className={errorBoxClass}>
          <WarningCircle size={18} weight="fill" className="shrink-0 text-red-600" />
          {t(`errors.${error}`)}
        </p>
      )}
    </form>
  );
}
