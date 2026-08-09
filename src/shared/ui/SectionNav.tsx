"use client";

import { clsx } from "clsx";
import { Link, usePathname } from "@/i18n/navigation";

export interface SectionNavItem {
  href: string;
  /** Resolved on the server — this component does no translation of its own. */
  label: string;
}

/**
 * Sidebar on desktop, horizontal scroller on mobile.
 *
 * Sidebar rather than the horizontal tabs one competitor uses, because tabs
 * stop working past about five entries and both lists that use this are going
 * to be longer than that (ARCHITECTURE.md §6a).
 *
 * Shared by the client account area and the admin console. It was the account
 * area's `AccountNav` first; the admin console needed the same thing, and a
 * second copy is how the two drift into looking like different products. The
 * one coupling that had to go was the hard-coded `Account.nav` namespace —
 * labels now arrive already translated, which also keeps the message catalogue
 * off the client entirely.
 *
 * Client-side only for `usePathname`; the pages themselves stay on the server.
 */
export default function SectionNav({
  items,
  label,
}: {
  items: SectionNavItem[];
  /** Accessible name for the nav landmark, e.g. "Account sections". */
  label: string;
}) {
  const pathname = usePathname();

  return (
    <nav
      aria-label={label}
      className="-mx-5 flex gap-1 overflow-x-auto px-5 pb-2 md:mx-0 md:flex-col md:overflow-visible md:px-0 md:pb-0"
    >
      {items.map((item) => {
        // Exact match, not startsWith: "/account" and "/admin" are prefixes of
        // every other section under them, so a prefix test would light up the
        // overview link on every page in the area.
        const active = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={clsx(
              "whitespace-nowrap rounded-full px-4 py-2.5 text-sm font-medium transition-colors md:rounded-xl",
              active
                ? "bg-amber-50 text-amber-700"
                : "text-char-600 hover:bg-char-100 hover:text-char-900"
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
