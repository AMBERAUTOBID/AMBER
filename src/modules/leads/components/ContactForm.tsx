"use client";

import { useEffect, useRef, useState } from "react";
import Script from "next/script";
import { useLocale, useTranslations } from "next-intl";
import { CheckCircle, WarningCircle } from "@phosphor-icons/react/dist/ssr";
// A pure whitelist check over a fixed list — no next/* imports, so it costs
// the client bundle almost nothing.
import { isPlanKey } from "@/modules/plans/model/plans";

type Status = "idle" | "submitting" | "success" | "error";

const RECAPTCHA_SITE_KEY = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY;

declare global {
  interface Window {
    grecaptcha?: {
      ready: (callback: () => void) => void;
      execute: (siteKey: string, options: { action: string }) => Promise<string>;
    };
  }
}

async function getRecaptchaToken(): Promise<string> {
  if (!RECAPTCHA_SITE_KEY || typeof window === "undefined" || !window.grecaptcha) {
    return "";
  }
  return new Promise((resolve) => {
    window.grecaptcha!.ready(() => {
      window
        .grecaptcha!.execute(RECAPTCHA_SITE_KEY, { action: "contact" })
        .then(resolve)
        .catch(() => resolve(""));
    });
  });
}

export default function ContactForm() {
  const t = useTranslations("Contact.form");
  const tPlans = useTranslations("Plans");
  const locale = useLocale();
  const [status, setStatus] = useState<Status>("idle");
  const messageRef = useRef<HTMLTextAreaElement>(null);

  /**
   * Prefills the message when someone arrives from a Coming Soon plan card,
   * so their enquiry says which tier they wanted instead of arriving blank.
   *
   * Read from `window.location` in an effect rather than from `searchParams`
   * on the server, or `useSearchParams` here — both opt this page out of
   * static generation, and /contact is one of the pages SEO depends on.
   * Measured: adding server-side searchParams flipped it from ● to ƒ in the
   * build output. Same trade the header account widget makes.
   *
   * ⚠️ The value is validated against the plan catalogue and never rendered
   * as text. `?plan=` comes from the URL, so anyone can write one — echoing
   * it straight into the textarea would let a crafted link put words in a
   * visitor's mouth and send them to us over their own name. Only a known
   * plan key resolves, and what it resolves to is one of our own sentences.
   *
   * Written through a ref rather than held in state, which keeps the field
   * uncontrolled: state set from an effect would either mismatch hydration
   * (the server renders an empty box, the client a filled one) or need the
   * value during the prerender, where `window` doesn't exist. It also leaves
   * `form.reset()` working on submit, which a controlled field would not.
   */
  useEffect(() => {
    const field = messageRef.current;
    // Never overwrite something already typed — the visitor wins.
    if (!field || field.value) return;
    const plan = new URLSearchParams(window.location.search).get("plan");
    if (!plan || !isPlanKey(plan)) return;
    field.value = t("planPrefill", { plan: tPlans(`tiers.${plan}.name`) });
  }, [t, tPlans]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("submitting");
    const form = e.currentTarget;
    const data = Object.fromEntries(new FormData(form).entries());
    const recaptchaToken = await getRecaptchaToken();

    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, locale, recaptchaToken }),
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
      {RECAPTCHA_SITE_KEY && (
        <Script
          src={`https://www.google.com/recaptcha/api.js?render=${RECAPTCHA_SITE_KEY}`}
          strategy="afterInteractive"
        />
      )}
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
        {/* Uncontrolled: the prefill is written straight to the node after
            hydration, and the visitor is free to delete or rewrite every word
            of it. A starting point, not a statement we put in their name. */}
        <textarea
          ref={messageRef}
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
