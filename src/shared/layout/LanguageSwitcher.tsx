"use client";

import { useState, useRef, useEffect } from "react";
import { useLocale } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { routing, localeNames, type AppLocale } from "@/i18n/routing";
import { CaretDown } from "@phosphor-icons/react/dist/ssr";
import LocaleFlag from "@/shared/ui/LocaleFlag";
import { clsx } from "clsx";

/**
 * `compact` shows the locale code ("LT") instead of its name ("Lietuvių").
 *
 * Only the header's desktop row asks for it, and only because the row is
 * width-critical: the full names run 119px where the code runs 60, and
 * those 59px are part of what lets the nav appear at 1280px instead of
 * 1536. The full name stays everywhere with room for it — the burger menu
 * and the footer — and remains the accessible name in both modes.
 */
export default function LanguageSwitcher({
  dark = false,
  compact = false,
}: {
  dark?: boolean;
  compact?: boolean;
}) {
  const locale = useLocale() as AppLocale;
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={compact ? localeNames[locale] : undefined}
        className={clsx(
          "flex items-center gap-1.5 rounded-full py-2 text-sm font-medium transition-colors",
          compact ? "px-2.5" : "px-3",
          dark
            ? "text-char-200 hover:bg-white/10 hover:text-white"
            : "text-char-600 hover:bg-char-100 hover:text-char-900"
        )}
      >
        {/* The flag replaces a generic globe icon, which looked identical in
            every language — the one thing a language control must not do.
            Drawn rather than an emoji flag; see LocaleFlag for why. */}
        <LocaleFlag locale={locale} size={18} />
        <span>{compact ? locale.toUpperCase() : localeNames[locale]}</span>
        <CaretDown size={12} weight="bold" aria-hidden />
      </button>
      {open && (
        <ul
          role="listbox"
          className="absolute right-0 z-50 mt-2 w-40 overflow-hidden rounded-xl border border-char-200 bg-white py-1 shadow-lg shadow-char-900/10"
        >
          {routing.locales.map((loc) => (
            <li key={loc}>
              <button
                type="button"
                role="option"
                aria-selected={loc === locale}
                onClick={() => {
                  setOpen(false);
                  router.replace(pathname, { locale: loc });
                }}
                className={clsx(
                  "flex w-full items-center gap-2.5 px-4 py-2 text-left text-sm transition-colors hover:bg-amber-50 hover:text-amber-700",
                  loc === locale ? "font-semibold text-amber-600" : "text-char-700"
                )}
              >
                <LocaleFlag locale={loc} size={18} />
                {localeNames[loc]}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
