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
import { routing, localeNames, type AppLocale } from "@/i18n/routing";

interface ProfileFormProps {
  name: string;
  phone: string;
  email: string;
  locale: string;
}

export default function ProfileForm(initial: ProfileFormProps) {
  const t = useTranslations("Account.details");
  const [name, setName] = useState(initial.name);
  const [phone, setPhone] = useState(initial.phone);
  const [locale, setLocale] = useState(initial.locale);
  const [state, setState] = useState<"idle" | "busy" | "saved" | "error">("idle");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState("busy");
    try {
      const res = await fetch("/api/account/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, phone, locale }),
      });
      setState(res.ok ? "saved" : "error");
    } catch {
      setState("error");
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <div>
        <label htmlFor="account-name" className={labelClass}>
          {t("name")}
        </label>
        <input
          id="account-name"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setState("idle");
          }}
          required
          maxLength={200}
          autoComplete="name"
          className={`mt-1.5 ${inputClass}`}
        />
      </div>

      <div>
        <label htmlFor="account-phone" className={labelClass}>
          {t("phone")}
        </label>
        <input
          id="account-phone"
          type="tel"
          value={phone}
          onChange={(e) => {
            setPhone(e.target.value);
            setState("idle");
          }}
          maxLength={50}
          autoComplete="tel"
          className={`mt-1.5 ${inputClass}`}
        />
        {/* No verified ✓/✗ marker, deliberately: verifying a number means SMS,
            which means a paid provider and a cost per signup. Until there is a
            reason, we show the number and don't pretend to have checked it. */}
        <p className="mt-1.5 text-xs text-char-500">{t("phoneHint")}</p>
      </div>

      <div>
        <label htmlFor="account-locale" className={labelClass}>
          {t("language")}
        </label>
        <select
          id="account-locale"
          value={locale}
          onChange={(e) => {
            setLocale(e.target.value);
            setState("idle");
          }}
          className={`mt-1.5 ${inputClass}`}
        >
          {routing.locales.map((code) => (
            <option key={code} value={code}>
              {localeNames[code as AppLocale]}
            </option>
          ))}
        </select>
        {/* Says what it actually does. It sets the language our emails are
            written in; the site's own language follows the URL and the header
            switcher, and claiming otherwise here would be a lie. */}
        <p className="mt-1.5 text-xs text-char-500">{t("languageHint")}</p>
      </div>

      <div>
        <span className={labelClass}>{t("email")}</span>
        <p className="mt-1.5 rounded-xl border border-char-200 bg-char-100/60 px-4 py-3 text-sm text-char-600">
          {initial.email}
        </p>
        {/* Not editable, and the hint says why. Changing it needs proof of the
            new address; without that it either locks someone out of their own
            password reset or hands the account to whoever typed it. */}
        <p className="mt-1.5 text-xs text-char-500">{t("emailHint")}</p>
      </div>

      {state === "saved" && (
        <p className={successBoxClass}>
          <CheckCircle size={18} weight="fill" className="shrink-0" />
          {t("saved")}
        </p>
      )}
      {state === "error" && (
        <p className={errorBoxClass}>
          <WarningCircle size={18} weight="fill" className="shrink-0" />
          {t("saveError")}
        </p>
      )}

      <button type="submit" disabled={state === "busy"} className={submitClass}>
        {t("save")}
      </button>
    </form>
  );
}
