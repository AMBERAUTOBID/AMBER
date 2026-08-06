"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Heart, WarningCircle } from "@phosphor-icons/react/dist/ssr";
import { clsx } from "clsx";

type State = "idle" | "busy" | "saved" | "needs_plan" | "error";

interface SaveLotButtonProps {
  /** VIN when there is one, else the lot number — the server resolves both. */
  lot: string;
  /** Whether this lot is already in the viewer's list, resolved server-side
   * in one query for the whole page. */
  initiallySaved: boolean;
  /** False for signed-out visitors, who are sent to register instead. */
  signedIn: boolean;
  /** Compact style for the corner of a search-result card. */
  variant?: "card" | "detail";
}

/**
 * Save a car, from a search result or its detail page.
 *
 * Signed-out visitors get the button too, and clicking it routes them to
 * registration rather than nothing happening. Hiding it would hide the
 * reason to register — this is the point where a browsing stranger has just
 * found something they want to keep.
 */
export default function SaveLotButton({
  lot,
  initiallySaved,
  signedIn,
  variant = "card",
}: SaveLotButtonProps) {
  const t = useTranslations("Favorites");
  const locale = useLocale();
  const [state, setState] = useState<State>(initiallySaved ? "saved" : "idle");

  async function save() {
    if (!signedIn) {
      window.location.assign(locale === "en" ? "/register" : `/${locale}/register`);
      return;
    }
    setState("busy");
    try {
      const res = await fetch("/api/favorites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lot }),
      });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (res.ok && body.ok) {
        setState("saved");
        return;
      }
      // The one refusal worth its own message: they're signed in and verified
      // but have no plan, and the fix is a link, not a retry.
      setState(body.error === "no_active_plan" ? "needs_plan" : "error");
    } catch {
      setState("error");
    }
  }

  if (state === "needs_plan") {
    return (
      <a
        href={locale === "en" ? "/plans" : `/${locale}/plans`}
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700 underline-offset-4 hover:underline"
      >
        {t("needsPlan")}
      </a>
    );
  }

  const saved = state === "saved";

  return (
    <button
      type="button"
      onClick={save}
      // Saved is a terminal state here: removing happens on the favourites
      // page, where the whole list is in view. A toggle on a search card
      // makes an accidental second click silently undo the first.
      disabled={saved || state === "busy"}
      aria-pressed={saved}
      title={saved ? t("savedTitle") : t("saveTitle")}
      className={clsx(
        "inline-flex items-center gap-1.5 rounded-full font-semibold transition-colors",
        variant === "card"
          ? "px-3 py-1.5 text-xs"
          : "border px-5 py-2.5 text-sm",
        saved
          ? "cursor-default bg-amber-50 text-amber-800 " +
              (variant === "detail" ? "border-amber-200" : "")
          : "bg-white text-char-700 hover:text-amber-700 " +
              (variant === "detail"
                ? "border-char-200 hover:border-amber-400"
                : "border border-char-200"),
        state === "busy" && "opacity-60"
      )}
    >
      {state === "error" ? (
        <WarningCircle size={variant === "card" ? 14 : 18} weight="fill" />
      ) : (
        <Heart
          size={variant === "card" ? 14 : 18}
          weight={saved ? "fill" : "regular"}
          className={saved ? "text-amber-600" : undefined}
        />
      )}
      {state === "error" ? t("saveError") : saved ? t("saved") : t("save")}
    </button>
  );
}
