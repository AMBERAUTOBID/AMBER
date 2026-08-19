"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { UserCircle } from "@phosphor-icons/react/dist/ssr";
import { Link } from "@/i18n/navigation";

interface Me {
  name: string;
}

/**
 * Shared across every instance on the page. The header renders this widget
 * twice — once in the desktop row, once in the burger menu — and both want
 * the same answer, so they share one request rather than each opening a
 * session lookup.
 *
 * Module scope is the right lifetime: login and logout both navigate with
 * `window.location.assign`, which reloads the module and drops this cache.
 * Nothing else changes who is signed in.
 */
let mePromise: Promise<Me | null> | null = null;

function loadMe(): Promise<Me | null> {
  mePromise ??= fetch("/api/auth/me", { credentials: "same-origin" })
    .then((r) => (r.ok ? r.json() : null))
    .then((data: { user?: Me | null } | null) => data?.user ?? null)
    .catch(() => null);
  return mePromise;
}

const STYLES = {
  desktop:
    "whitespace-nowrap rounded-full border border-char-200 bg-white px-3.5 py-2.5 text-sm font-semibold text-char-800 transition-colors hover:border-amber-400 hover:text-amber-700",
  mobile:
    "inline-flex items-center gap-1.5 rounded-full border border-char-200 bg-white px-4 py-2.5 text-sm font-semibold text-char-800",
} as const;

/**
 * "Sign up", filled amber, beside the outlined "Log in".
 *
 * ⚠️ SIGN UP IS THE PRIMARY OF THE TWO HERE, WHICH IS THE OPPOSITE OF THE
 * COMPETITOR. bidauto.online fills "Log in" and outlines "Sign up" — the right
 * emphasis for a business whose visitors are mostly returning. Ours is not one
 * yet: production holds three users. The button that matters to us is the one
 * that turns a stranger into an account. Worth revisiting when returning
 * traffic outweighs new.
 *
 * Rendered only to a signed-OUT visitor, so it costs a signed-in client nothing
 * and never competes with their own name in the same slot.
 */
const REGISTER_STYLES = {
  desktop:
    "whitespace-nowrap rounded-full bg-amber-600 px-3.5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-amber-700",
  mobile:
    "inline-flex items-center gap-1.5 rounded-full bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white",
} as const;

/**
 * The header's one session-aware element (ARCHITECTURE.md §6a).
 *
 * `Header.tsx` is static on purpose and lives in `shared/`, which may not
 * import from `modules/` — so this arrives as a slot from the locale layout
 * rather than being imported there.
 *
 * Renders NOTHING until the answer arrives. A brief gap is invisible; showing
 * "Log in" to someone who is already signed in is what reads as broken.
 */
export default function HeaderAccount({ variant }: { variant: "desktop" | "mobile" }) {
  const t = useTranslations("Nav");
  const [state, setState] = useState<{ resolved: boolean; me: Me | null }>({
    resolved: false,
    me: null,
  });

  useEffect(() => {
    let active = true;
    loadMe().then((me) => {
      if (active) setState({ resolved: true, me });
    });
    return () => {
      active = false;
    };
  }, []);

  if (!state.resolved) {
    // A placeholder the same height as the button, so the row doesn't jump
    // when the answer lands. Width is left to the content: reserving a fixed
    // width would only be right for one of the two possible labels.
    return <span aria-hidden className="block h-[42px]" />;
  }

  if (!state.me) {
    return (
      // Log in first, sign up second, reading order left to right — but the
      // amber fill is on sign up. Order is where the eye starts; weight is what
      // it lands on, and a returning client already knows where log in lives.
      <span className="flex items-center gap-2">
        <Link href="/login" className={STYLES[variant]}>
          {t("login")}
        </Link>
        <Link href="/register" className={REGISTER_STYLES[variant]}>
          {t("register")}
        </Link>
      </span>
    );
  }

  // First name only. The header has ~100px for this and "Aleksandr
  // Petrauskas" would blow the row apart at exactly the widths the nav
  // already fights for.
  const firstName = state.me.name.trim().split(/\s+/)[0];

  return (
    <Link
      href="/account"
      className={`${STYLES[variant]} inline-flex items-center gap-1.5`}
      title={state.me.name}
    >
      <UserCircle size={18} weight="fill" className="text-amber-500" />
      {/* 5rem in the desktop row, 9rem in the burger menu. The cap is not
          cosmetic: signed in, this button is the one item in the row whose
          width a visitor chooses, and measured in Lithuanian at 1280px the row
          has ~30px spare — a 9rem name spends 60 of them and pushes the CTA
          off the edge. The full name is still the link's title, and the menu,
          which has the width, still shows it whole. */}
      <span className={variant === "desktop" ? "max-w-[5rem] truncate" : "max-w-[9rem] truncate"}>
        {firstName}
      </span>
    </Link>
  );
}
