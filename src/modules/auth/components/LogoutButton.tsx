"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";

export default function LogoutButton() {
  const t = useTranslations("Auth.account");
  const locale = useLocale();
  const [busy, setBusy] = useState(false);

  async function handleLogout() {
    setBusy(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      // Full navigation for the same reason login does one: the header and
      // page must re-render on the server without the session cookie.
      window.location.assign(locale === "en" ? "/" : `/${locale}`);
    }
  }

  return (
    <button
      type="button"
      onClick={handleLogout}
      disabled={busy}
      className="inline-flex items-center justify-center rounded-full border border-char-200 bg-white px-6 py-3 text-sm font-semibold text-char-800 transition-colors hover:border-amber-400 hover:text-amber-700 disabled:opacity-60"
    >
      {t("logout")}
    </button>
  );
}
