"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { WarningCircle } from "@phosphor-icons/react/dist/ssr";
import { errorBoxClass, inputClass, labelClass, submitClass } from "./formStyles";

type ErrorKind = "invalid_credentials" | "email_not_verified" | "rate_limited" | "generic";

/**
 * `next` arrives already validated by the server page (safeReturnPath) rather
 * than being read from the URL here. Deliberate: a client component reading
 * `?next=` itself would put the check on the browser's side of the line,
 * where a determined caller simply doesn't run it.
 */
export default function LoginForm({ next }: { next?: string | null }) {
  const t = useTranslations("Auth.login");
  const locale = useLocale();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<ErrorKind | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const data = Object.fromEntries(new FormData(e.currentTarget).entries());
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        const target = next ?? "/account";
        // Full navigation, not router.push: the account page renders on the
        // server from the new cookie, so the browser must send it.
        window.location.assign(locale === "en" ? target : `/${locale}${target}`);
        return;
      }
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      setError(
        body.error === "invalid_credentials" || body.error === "email_not_verified" || body.error === "rate_limited"
          ? body.error
          : "generic"
      );
    } catch {
      setError("generic");
    }
    setSubmitting(false);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <label htmlFor="email" className={labelClass}>
          {t("email")}
        </label>
        <input id="email" name="email" type="email" autoComplete="email" required className={`mt-1.5 ${inputClass}`} />
      </div>
      <div>
        <div className="flex items-baseline justify-between">
          <label htmlFor="password" className={labelClass}>
            {t("password")}
          </label>
          <Link href="/forgot-password" className="text-xs font-medium text-amber-700 hover:underline">
            {t("forgot")}
          </Link>
        </div>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className={`mt-1.5 ${inputClass}`}
        />
      </div>

      <button type="submit" disabled={submitting} className={submitClass}>
        {submitting ? t("submitting") : t("submit")}
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
