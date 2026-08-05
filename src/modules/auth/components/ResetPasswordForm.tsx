"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { CheckCircle, WarningCircle } from "@phosphor-icons/react/dist/ssr";
import { errorBoxClass, inputClass, labelClass, submitClass, successBoxClass } from "./formStyles";
// The policy module, not model/password — that one imports node:crypto.
import { MIN_PASSWORD_LENGTH } from "../model/passwordPolicy";

export default function ResetPasswordForm({ token }: { token: string }) {
  const t = useTranslations("Auth.reset");
  const [status, setStatus] = useState<"idle" | "submitting" | "done">("idle");
  const [error, setError] = useState<"weak_password" | "invalid_or_expired" | "generic" | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("submitting");
    setError(null);
    const data = Object.fromEntries(new FormData(e.currentTarget).entries());
    try {
      const res = await fetch("/api/auth/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password: data.password }),
      });
      if (res.ok) {
        setStatus("done");
        return;
      }
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      setError(
        body.error === "weak_password" || body.error === "invalid_or_expired" ? body.error : "generic"
      );
    } catch {
      setError("generic");
    }
    setStatus("idle");
  }

  if (status === "done") {
    return (
      <div className="space-y-4">
        <p className={successBoxClass}>
          <CheckCircle size={18} weight="fill" className="shrink-0 text-green-600" />
          {t("done")}
        </p>
        <Link href="/login" className="text-sm font-medium text-amber-700 hover:underline">
          {t("toLogin")}
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <label htmlFor="password" className={labelClass}>
          {t("newPassword")}
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
