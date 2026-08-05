"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";

export default function LogoutButton() {
  const t = useTranslations("Account");
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
      className="text-sm font-semibold text-char-600 underline-offset-4 transition-colors hover:text-char-900 hover:underline disabled:opacity-60"
    >
      {t("logout")}
    </button>
  );
}
