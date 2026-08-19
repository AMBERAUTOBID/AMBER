"use client";

import { useState, useSyncExternalStore } from "react";
import Script from "next/script";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

const GA_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
const STORAGE_KEY = "smartautobid-cookie-consent";

type Consent = "granted" | "denied";

function subscribe() {
  return () => {};
}

function getStoredConsent(): Consent | null {
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return stored === "granted" || stored === "denied" ? stored : null;
}

function getServerConsent(): Consent | null {
  return null;
}

export default function CookieConsent() {
  const t = useTranslations("CookieConsent");
  const storedConsent = useSyncExternalStore(subscribe, getStoredConsent, getServerConsent);
  const [override, setOverride] = useState<Consent | null>(null);
  const consent = override ?? storedConsent;

  function choose(value: Consent) {
    window.localStorage.setItem(STORAGE_KEY, value);
    setOverride(value);
  }

  if (!GA_ID) return null;

  const loadAnalytics = consent === "granted";
  const showBanner = consent === null;

  return (
    <>
      {loadAnalytics && (
        <>
          <Script
            src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
            strategy="afterInteractive"
          />
          <Script id="ga-init" strategy="afterInteractive">
            {`
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              gtag('js', new Date());
              gtag('config', '${GA_ID}');
            `}
          </Script>
        </>
      )}

      {showBanner && (
        <div className="fixed inset-x-0 bottom-0 z-50 border-t border-char-200 bg-white/95 px-5 py-4 backdrop-blur-sm sm:px-8">
          <div className="mx-auto flex max-w-7xl flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-char-600">
              {t("message")}{" "}
              <Link
                href="/privacy"
                className="inline-block py-1.5 font-semibold text-amber-600 underline underline-offset-2 hover:text-amber-700"
              >
                {t("privacyLink")}
              </Link>
            </p>
            <div className="flex shrink-0 gap-2">
              <button
                type="button"
                onClick={() => choose("denied")}
                className="inline-flex min-h-11 items-center rounded-full border border-char-200 px-4 py-2 text-sm font-semibold text-char-700 transition-colors hover:bg-char-50"
              >
                {t("decline")}
              </button>
              <button
                type="button"
                onClick={() => choose("granted")}
                className="inline-flex min-h-11 items-center rounded-full bg-amber-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-amber-700"
              >
                {t("accept")}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
