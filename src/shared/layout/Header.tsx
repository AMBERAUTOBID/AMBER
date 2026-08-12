"use client";

import { useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import {
  List,
  X,
  ArrowRight,
  InstagramLogo,
  YoutubeLogo,
  WhatsappLogo,
  FacebookLogo,
} from "@phosphor-icons/react/dist/ssr";
import { clsx } from "clsx";
import LanguageSwitcher from "./LanguageSwitcher";
import { TextRoll } from "../ui/text-roll";
import { socialLinks, type SocialNetwork } from "@/shared/config/site";

const BRAND_PART_1 = "Smart";
const BRAND_PART_2 = "AutoBid";

/**
 * Which glyph draws which network. Lives here rather than in `site.ts` because
 * that file is imported by the Telegram bot outside React and must stay plain
 * data — it hands over a key, and this decides what a key looks like.
 */
const SOCIAL_ICON: Record<SocialNetwork, typeof InstagramLogo> = {
  instagram: InstagramLogo,
  youtube: YoutubeLogo,
  whatsapp: WhatsappLogo,
  facebook: FacebookLogo,
};

const SOCIAL_LABEL: Record<SocialNetwork, string> = {
  instagram: "Instagram",
  youtube: "YouTube",
  whatsapp: "WhatsApp",
  facebook: "Facebook",
};

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

  // Five, not seven. "Home" and "Contact" are both already reachable from this
  // same bar — the wordmark links home, and the amber CTA goes to /contact —
  // so listing them again spent 145px of a row that had none to spare. They
  // are gone from the burger menu too, which carries the same CTA at its
  // foot and the same wordmark above it.
  //
  // ⚠️ THE LABELS ARE SHORT ON PURPOSE — measured 2026-08-12, in Lithuanian,
  // the longest locale, at 1280px, the narrowest screen that gets this row.
  // Adding "Our offers" (138px) and the four social icons (134px) took the row
  // to 1,457px against 1,280 — 177px over, and 43px over even with the icons
  // removed, so the link alone had broken it. "Automobilių paieška" →
  // "Paieška" and "Gabenimas ir sekimas" → "Gabenimas" gave back ~150px; the
  // rest came from the gaps, the icon size and the CTA's padding.
  //
  // WHERE IT STANDS NOW: 50px spare signed out, 12px in the worst signed-in
  // case (a name filling HeaderAccount's 5rem cap). The full page names still
  // head their own pages. RE-MEASURE IN LITHUANIAN, SIGNED IN, BEFORE ADDING
  // ANYTHING HERE — 12px is one word.
  //
  // "Our offers" sits second, straight after the auction search: the two are
  // the same question asked twice — a car to bid on, or a car already bought
  // and ready to buy outright — and a visitor who does not want to wait for an
  // auction should meet the alternative immediately, not at the end of the row.
  const links = [
    { href: "/search", label: t("search") },
    { href: "/offers", label: t("offers") },
    { href: "/plans", label: t("plans") },
    { href: "/shipping", label: t("shipping") },
    { href: "/about", label: t("about") },
  ];

  const socials = socialLinks();

  return (
    <header className="sticky top-0 z-50 border-b border-char-200/70 bg-background/90 backdrop-blur-md">
      {/* gap-4, not gap-8: the wordmark-to-nav gap was 32px of a row that at
          1280px in Lithuanian had exactly zero left over. Halving it is the
          cheapest 16px on the bar — nothing about it is load-bearing. */}
      <div className="mx-auto flex h-18 max-w-7xl items-center gap-4 px-5 py-3 sm:px-8">
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
        <div className="hidden flex-1 items-center gap-0.5 xl:flex">
          {links.map((link) => {
            const active = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={clsx(
                  // px-1.5 not px-2.5: Lithuanian labels are long enough that
                  // the row kept clearing its container by single digits, and
                  // a scrollbar swallows that. Each step of tightening buys
                  // ~20px across the five links — see the measurement note
                  // above the list.
                  "whitespace-nowrap rounded-full px-1 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-amber-50 text-amber-700"
                    : "text-char-600 hover:bg-char-100 hover:text-char-900"
                )}
              >
                {link.label}
              </Link>
            );
          })}
          {/* Replaced the phone number, at the owner's request. The number cost
              162px of a row that had none; four icons cost ~120px and say more
              — the audience reaches us on WhatsApp far more than by dialling a
              US number from Europe. The number itself did not disappear from
              the site: it is in the footer on every page, on /contact, and in
              the burger menu below. */}
          <div className="flex items-center">
            {socials.map(({ network, href }) => {
              const Icon = SOCIAL_ICON[network];
              return (
                <a
                  key={network}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={SOCIAL_LABEL[network]}
                  title={SOCIAL_LABEL[network]}
                  className="flex h-6 w-6 items-center justify-center rounded-full text-char-500 transition-colors hover:bg-char-100 hover:text-amber-600"
                >
                  <Icon size={18} weight="fill" />
                </a>
              );
            })}
          </div>
          <LanguageSwitcher compact />
          {/* This header is still static: the slot resolves the session on
              the client after hydration, so every marketing page keeps its
              pre-rendered HTML. See HeaderAccount. */}
          {account}
          <Link
            href="/contact"
            className="group inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-amber-500 px-3 py-2.5 text-sm font-semibold text-white shadow-sm shadow-amber-900/20 transition-all hover:bg-amber-600 hover:shadow-md"
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
          </nav>
          {/* Bigger targets than the desktop row's: this is the width where
              people are using a thumb. */}
          <div className="mt-3 flex items-center gap-1 px-1">
            {socials.map(({ network, href }) => {
              const Icon = SOCIAL_ICON[network];
              return (
                <a
                  key={network}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={SOCIAL_LABEL[network]}
                  className="flex h-11 w-11 items-center justify-center rounded-full text-char-600 hover:bg-char-100 hover:text-amber-600"
                >
                  <Icon size={22} weight="fill" />
                </a>
              );
            })}
          </div>
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
