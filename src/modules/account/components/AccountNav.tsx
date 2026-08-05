"use client";

import { useTranslations } from "next-intl";
import { clsx } from "clsx";
import { Link, usePathname } from "@/i18n/navigation";
import type { AccountSection } from "../model/sections";

/**
 * Sidebar on desktop, horizontal scroller on mobile.
 *
 * Sidebar rather than the horizontal tabs one competitor uses, because tabs
 * stop working past about five entries and this list is going to be longer —
 * bids, watchlist and orders are all coming (ARCHITECTURE.md §6a).
 *
 * Client-side only for `usePathname`; the pages themselves stay on the
 * server.
 */
export default function AccountNav({ sections }: { sections: AccountSection[] }) {
  const t = useTranslations("Account.nav");
  const pathname = usePathname();

  return (
    <nav
      aria-label={t("label")}
      className="-mx-5 flex gap-1 overflow-x-auto px-5 pb-2 md:mx-0 md:flex-col md:overflow-visible md:px-0 md:pb-0"
    >
      {sections.map((section) => {
        // Exact match, not startsWith: "/account" is a prefix of every other
        // section, so a prefix test would light up the overview link on
        // every page in the area.
        const active = pathname === section.href;
        return (
          <Link
            key={section.href}
            href={section.href}
            aria-current={active ? "page" : undefined}
            className={clsx(
              "whitespace-nowrap rounded-full px-4 py-2.5 text-sm font-medium transition-colors md:rounded-xl",
              active
                ? "bg-amber-50 text-amber-700"
                : "text-char-600 hover:bg-char-100 hover:text-char-900"
            )}
          >
            {t(section.key)}
          </Link>
        );
      })}
    </nav>
  );
}
