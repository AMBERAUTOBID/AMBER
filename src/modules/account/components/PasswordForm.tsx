"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { CheckCircle, WarningCircle } from "@phosphor-icons/react/dist/ssr";
import {
  inputClass,
  labelClass,
  submitClass,
  errorBoxClass,
  successBoxClass,
} from "@/modules/auth/components/formStyles";
// passwordPolicy, NOT password: the latter imports node:crypto and crashes
// the browser bundle on load.
import { MIN_PASSWORD_LENGTH } from "@/modules/auth/model/passwordPolicy";

type Status = "idle" | "busy" | "saved" | "invalid_current" | "weak_password" | "rate_limited" | "error";

export default function PasswordForm() {
  const t = useTranslations("Account.details");
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [status, setStatus] = useState<Status>("idle");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("busy");
    try {
      const res = await fetch("/api/account/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (res.ok && body.ok) {
        setStatus("saved");
        // Cleared on success so the new password isn't left sitting in a form
        // field on a screen someone may walk away from.
        setCurrent("");
        setNext("");
        return;
      }
      setStatus(
        body.error === "invalid_current" ||
          body.error === "weak_password" ||
          body.error === "rate_limited"
          ? body.error
          : "error"
      );
    } catch {
      setStatus("error");
    }
  }

  const message =
    status === "invalid_current"
      ? t("currentPasswordWrong")
      : status === "weak_password"
        ? t("passwordTooShort", { min: MIN_PASSWORD_LENGTH })
        : status === "rate_limited"
          ? t("passwordRateLimited")
          : status === "error"
            ? t("saveError")
            : null;

  return (
    <form onSubmit={submit} className="space-y-5">
      <div>
        <label htmlFor="current-password" className={labelClass}>
          {t("currentPassword")}
        </label>
        <input
          id="current-password"
          type="password"
          value={current}
          onChange={(e) => {
            setCurrent(e.target.value);
            setStatus("idle");
          }}
          required
          autoComplete="current-password"
          className={`mt-1.5 ${inputClass}`}
        />
      </div>

      <div>
        <label htmlFor="new-password" className={labelClass}>
          {t("newPassword")}
        </label>
        <input
          id="new-password"
          type="password"
          value={next}
          onChange={(e) => {
            setNext(e.target.value);
            setStatus("idle");
          }}
          required
          minLength={MIN_PASSWORD_LENGTH}
          autoComplete="new-password"
          className={`mt-1.5 ${inputClass}`}
        />
        <p className="mt-1.5 text-xs text-char-500">
          {t("passwordHint", { min: MIN_PASSWORD_LENGTH })}
        </p>
      </div>

      {status === "saved" && (
        <p className={successBoxClass}>
          <CheckCircle size={18} weight="fill" className="shrink-0" />
          {/* Says the other-devices part out loud: someone who changes their
              password because they think it leaked needs to know the leak was
              actually closed. */}
          {t("passwordChanged")}
        </p>
      )}
      {message && (
        <p className={errorBoxClass}>
          <WarningCircle size={18} weight="fill" className="shrink-0" />
          {message}
        </p>
      )}

      <button type="submit" disabled={status === "busy"} className={submitClass}>
        {t("changePassword")}
      </button>
    </form>
  );
}
