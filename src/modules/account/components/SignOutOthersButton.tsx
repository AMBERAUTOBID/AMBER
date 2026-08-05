"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { WarningCircle } from "@phosphor-icons/react/dist/ssr";
import { errorBoxClass } from "@/modules/auth/components/formStyles";

/**
 * Revokes every session except this browser's.
 *
 * One click, no confirm step — unlike cancelling a plan request, the worst
 * case here is that someone signs in again on their other laptop. Making the
 * safe action harder than the unsafe one is how people end up leaving a
 * device they don't recognise signed in.
 */
export default function SignOutOthersButton({ otherCount }: { otherCount: number }) {
  const t = useTranslations("Account.details");
  const [state, setState] = useState<"idle" | "busy" | "error">("idle");

  async function signOutOthers() {
    setState("busy");
    try {
      const res = await fetch("/api/account/sessions", { method: "POST" });
      if (!res.ok) {
        setState("error");
        return;
      }
      // Reload rather than filtering the list locally: the list is
      // server-rendered, and re-reading it is the only way to be sure what's
      // on screen matches what's in the database.
      window.location.reload();
    } catch {
      setState("error");
    }
  }

  if (state === "error") {
    return (
      <p className={errorBoxClass}>
        <WarningCircle size={18} weight="fill" className="shrink-0" />
        {t("saveError")}
      </p>
    );
  }

  return (
    <button
      type="button"
      onClick={signOutOthers}
      disabled={state === "busy" || otherCount === 0}
      className="text-sm font-semibold text-char-600 underline-offset-4 transition-colors hover:text-red-700 hover:underline disabled:cursor-not-allowed disabled:text-char-400 disabled:no-underline"
    >
      {t("signOutOthers", { count: otherCount })}
    </button>
  );
}
