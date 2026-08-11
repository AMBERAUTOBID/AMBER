"use client";

import { useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { List, X, ArrowRight, Phone } from "@phosphor-icons/react/dist/ssr";
import { clsx } from "clsx";
import LanguageSwitcher from "./LanguageSwitcher";
import { TextRoll } from "../ui/text-roll";
import { SITE, CONTACT_HREF } from "@/shared/config/site";

const BRAND_PART_1 = "Smart";
const BRAND_PART_2 = "AutoBid";

interface HeaderProps {
  /**
   * The account button, injected as a slot rather than imported.
   *
   * It has to know who is signed in, which is a `modules/auth` concern, and
   * `shared/` may not import from `modules/` (ARCHITECTURE.md §2). The locale
   * layout sits above both and can import either, so it passes them in.
   *
   * Two slots, not one: the desktop row and the burger menu style the button
   * differently, and the desktop row's padding is load-bearing — see the
   * width note above it.
   */
  account?: React.ReactNode;
  accountMobile?: React.ReactNode;
}

export default function Header({ account, accountMobile }: HeaderProps) {
  const t = useTranslations("Nav");
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [prevPathname, setPrevPathname] = useState(pathname);

  if (pathname !== prevPathname) {
    setPrevPathname(pathname);
    setOpen(false);
  }

  // Four, not six. "Home" and "Contact" are both already reachable from this
  // same bar — the wordmark links home, and the amber CTA goes to /contact —
  // so listing them again spent 145px of a row that had none to spare. They
  // are gone from the burger menu too, which carries the same CTA at its
  // foot and the same wordmark above it.
  const links = [
    { href: "/search", label: t("search") },
    { href: "/plans", label: t("plans") },
    { href: "/shipping", label: t("shipping") },
    { href: "/about", label: t("about") },
  ];

  return (
    <header className="sticky top-0 z-50 border-b border-char-200/70 bg-background/90 backdrop-blur-md">
      <div className="mx-auto flex h-18 max-w-7xl items-center gap-8 px-5 py-3 sm:px-8">
        <Link href="/" className="flex shrink-0 items-center gap-2">
          <span className="relative h-12 w-12 sm:h-14 sm:w-14">
            <Image
              src="/images/logo-mark-transparent.png"
              alt="SmartAutoBid"
              fill
              sizes="56px"
              className="object-contain"
              priority
            />
          </span>
          <span className="font-[family-name:var(--font-heading)] text-xl font-extrabold tracking-tight text-char-900 sm:text-2xl">
            <TextRoll
              key={`${pathname}-1`}
              duration={0.5}
              getEnterDelay={(i) => i * 0.04}
              getExitDelay={(i) => i * 0.04 + 0.2}
            >
              {BRAND_PART_1}
            </TextRoll>
            <TextRoll
              key={`${pathname}-2`}
              className="text-amber-500"
              duration={0.5}
              getEnterDelay={(i) => (i + BRAND_PART_1.length) * 0.04}
              getExitDelay={(i) => (i + BRAND_PART_1.length) * 0.04 + 0.2}
            >
              {BRAND_PART_2}
            </TextRoll>
          </span>
        </Link>

        {/* xl. This used to be 2xl, which meant every 1280, 1366 and 1440px
            laptop — most of them — got the burger menu on a desktop screen.
            The old comment was right that the row did not fit: measured in
            Lithuanian, the longest locale, it needed 1,133px against 960px
            available. The fix is fewer things in the row rather than a
            higher breakpoint. Dropping the two duplicated links (-145px)
            and shortening the language button to its code (-59px) brings it
            to ~941px, which clears 960 with room for a scrollbar. Re-measure
            in Lithuanian before adding anything back. */}
        <div className="hidden flex-1 items-center gap-1 xl:flex">
          {links.map((link) => {
            const active = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={clsx(
                  // px-2 not px-2.5: Lithuanian labels are long enough that
                  // the row cleared 1536px by only 7px, which a scrollbar
                  // swallows. The tighter padding buys ~35px of headroom.
                  "whitespace-nowrap rounded-full px-2 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-amber-50 text-amber-700"
                    : "text-char-600 hover:bg-char-100 hover:text-char-900"
                )}
              >
                {link.label}
              </Link>
            );
          })}
          {/* The phone needs another 162px that even 1536px doesn't have once
              Lithuanian labels are in play, so it appears only on genuinely
              wide screens. It is still one tap away in the burger menu, and
              in the footer, on every screen below that. */}
          <a
            href={CONTACT_HREF.tel}
            className="hidden items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-2 text-sm font-medium text-char-600 transition-colors hover:bg-char-100 hover:text-char-900 min-[1750px]:flex"
          >
            <Phone size={16} weight="fill" className="text-amber-500" />
            {SITE.phone.display}
          </a>
          <LanguageSwitcher compact />
          {/* This header is still static: the slot resolves the session on
              the client after hydration, so every marketing page keeps its
              pre-rendered HTML. See HeaderAccount. */}
          {account}
          <Link
            href="/contact"
            className="group inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-amber-500 px-3.5 py-2.5 text-sm font-semibold text-white shadow-sm shadow-amber-900/20 transition-all hover:bg-amber-600 hover:shadow-md"
          >
            {t("cta")}
            <ArrowRight
              size={15}
              weight="bold"
              className="transition-transform group-hover:translate-x-0.5"
            />
          </Link>
        </div>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          className="flex h-10 w-10 items-center justify-center rounded-full text-char-700 hover:bg-char-100 xl:hidden"
        >
          {open ? <X size={22} /> : <List size={22} />}
        </button>
      </div>

      {open && (
        <div className="border-t border-char-200/70 bg-background px-5 pb-6 pt-2 xl:hidden">
          <nav className="flex flex-col gap-1">
            {links.map((link) => {
              const active = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={clsx(
                    "rounded-lg px-3 py-3 text-base font-medium",
                    active
                      ? "bg-amber-50 text-amber-700"
                      : "text-char-700 hover:bg-char-100"
                  )}
                >
                  {link.label}
                </Link>
              );
            })}
            {/* Carries the phone at every width where the desktop row hides
                it — which, since the 2xl change, is most screens. */}
            <a
              href={CONTACT_HREF.tel}
              className="flex items-center gap-2 rounded-lg px-3 py-3 text-base font-medium text-char-700 hover:bg-char-100"
            >
              <Phone size={18} weight="fill" className="text-amber-500" />
              {SITE.phone.display}
            </a>
          </nav>
          {/* The CTA gets its own row. All three on one line overflowed a
              375px screen — "Lietuvių" plus a signed-in first name plus
              "Gauti nemokamą pasiūlymą" needs ~430px against 335px of
              content width, and the button was cut off at the right edge.
              Full width also gives the primary action a proper tap target. */}
          <div className="mt-4 border-t border-char-200/70 pt-4">
            <div className="flex items-center justify-between gap-3">
              <LanguageSwitcher />
              {accountMobile}
            </div>
            <Link
              href="/contact"
              className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-full bg-amber-500 px-4 py-3 text-sm font-semibold text-white"
            >
              {t("cta")}
              <ArrowRight size={15} weight="bold" />
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
