"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { CheckCircle, WarningCircle } from "@phosphor-icons/react/dist/ssr";

type Status = "idle" | "submitting" | "success" | "error";

export default function ContactForm() {
  const t = useTranslations("Contact.form");
  const locale = useLocale();
  const [status, setStatus] = useState<Status>("idle");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("submitting");
    const form = e.currentTarget;
    const data = Object.fromEntries(new FormData(form).entries());

    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, locale }),
      });
      if (!res.ok) throw new Error("Request failed");
      setStatus("success");
      form.reset();
    } catch {
      setStatus("error");
    }
  }

  const inputClass =
    "w-full rounded-xl border border-char-200 bg-char-50 px-4 py-3 text-sm text-char-900 outline-none transition-colors placeholder:text-char-400 focus:border-amber-400 focus:bg-white focus:ring-2 focus:ring-amber-100";
  const labelClass = "block text-sm font-medium text-char-800";

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="name" className={labelClass}>
            {t("name")} <span className="text-amber-600">*</span>
          </label>
          <input
            id="name"
            name="name"
            type="text"
            required
            className={`mt-1.5 ${inputClass}`}
          />
        </div>
        <div>
          <label htmlFor="email" className={labelClass}>
            {t("email")} <span className="text-amber-600">*</span>
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            className={`mt-1.5 ${inputClass}`}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="phone" className={labelClass}>
            {t("phone")}
          </label>
          <input id="phone" name="phone" type="tel" className={`mt-1.5 ${inputClass}`} />
        </div>
        <div>
          <label htmlFor="vehicle" className={labelClass}>
            {t("vehicle")}
          </label>
          <input
            id="vehicle"
            name="vehicle"
            type="text"
            placeholder={t("vehiclePlaceholder")}
            className={`mt-1.5 ${inputClass}`}
          />
        </div>
      </div>

      <div>
        <label htmlFor="message" className={labelClass}>
          {t("message")}
        </label>
        <textarea
          id="message"
          name="message"
          rows={4}
          placeholder={t("messagePlaceholder")}
          className={`mt-1.5 resize-none ${inputClass}`}
        />
      </div>

      <button
        type="submit"
        disabled={status === "submitting"}
        className="inline-flex items-center justify-center gap-2 rounded-full bg-amber-500 px-7 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {status === "submitting" ? t("submitting") : t("submit")}
      </button>

      {status === "success" && (
        <p className="flex items-center gap-2 rounded-xl bg-green-50 px-4 py-3 text-sm text-green-800">
          <CheckCircle size={18} weight="fill" className="shrink-0 text-green-600" />
          {t("success")}
        </p>
      )}
      {status === "error" && (
        <p className="flex items-center gap-2 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">
          <WarningCircle size={18} weight="fill" className="shrink-0 text-red-600" />
          {t("error")}
        </p>
      )}
    </form>
  );
}
