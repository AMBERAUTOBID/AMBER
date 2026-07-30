"use client";

import { useState, useRef, useEffect } from "react";
import { useLocale } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { routing, localeNames, type AppLocale } from "@/i18n/routing";
import { Globe, CaretDown } from "@phosphor-icons/react/dist/ssr";
import { clsx } from "clsx";

export default function LanguageSwitcher({ dark = false }: { dark?: boolean }) {
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
        className={clsx(
          "flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-medium transition-colors",
          dark
            ? "text-char-200 hover:bg-white/10 hover:text-white"
            : "text-char-600 hover:bg-char-100 hover:text-char-900"
        )}
      >
        <Globe size={18} weight="bold" aria-hidden />
        <span>{localeNames[locale]}</span>
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
                  "block w-full px-4 py-2 text-left text-sm transition-colors hover:bg-amber-50 hover:text-amber-700",
                  loc === locale ? "font-semibold text-amber-600" : "text-char-700"
                )}
              >
                {localeNames[loc]}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
