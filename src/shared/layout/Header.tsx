"use client";

import { useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { List, X, ArrowRight, Envelope, TelegramLogo } from "@phosphor-icons/react/dist/ssr";
import { clsx } from "clsx";
import LanguageSwitcher from "./LanguageSwitcher";
import ContactMenu from "./ContactMenu";
import { TextRoll } from "../ui/text-roll";
import { socialLinks, CONTACT_HREF, SITE } from "@/shared/config/site";
import { SOCIAL_ICON, SOCIAL_LABEL } from "./socialIcons";

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
      {/*
        ⚠️ TWO ROWS, AND THE SECOND ONE IS WHAT PAYS FOR THE NAVIGATION.

        The owner asked on 2026-08-19 for larger, clearer navigation labels. The
        obstacle was never taste — it was width, and every note above this one
        says so. MEASURED AT 1280px, LITHUANIAN, SIGNED OUT, before touching
        anything: logo 224 + navigation 633 + actions 311 = 1,169 against 1,201
        of inner width. **32px spare.** Taking the labels from 14px to 15px costs
        the navigation ~45px, so the honest answer to "just make them bigger" was
        that the row would break and drop to the burger menu on every 1280px
        laptop.

        So the 311px of actions — contact menu, language, sign in — moved up here
        into a strip of their own. They are things you DO and they are consulted
        rarely; the five links are where you GO. That hands the navigation
        977px instead of 633, which buys 16px type at weight 600 with real gaps
        between the labels and still leaves well over 100px spare.

        WHAT IT COSTS: the header goes from 73px to about 116px. That is the
        trade, and it was the owner's call.

        ⚠️ THE STRIP IS `xl` ONLY, exactly like the actions it holds. Below that
        breakpoint nothing here changes: those three items were already hidden
        and live in the burger menu, so a phone sees the same single row it saw
        before. Re-measure in Lithuanian, SIGNED IN — where `HeaderAccount` swaps
        a 98px button for a name up to 5rem — before adding anything to either
        row.
      */}
      <div className="hidden border-b border-char-200/60 bg-char-50/50 xl:block">
        <div className="mx-auto flex max-w-7xl items-center justify-end gap-1.5 px-5 sm:px-8">
          <ContactMenu />
          <LanguageSwitcher compact />
          {/* This header is still static: the slot resolves the session on the
              client after hydration, so every marketing page keeps its
              pre-rendered HTML. See HeaderAccount. */}
          {account}
        </div>
      </div>

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
        {/*
          THREE ZONES, NOT ONE ROW — logo left, navigation centred, actions
          right. This used to be a single flex box holding all eight items at a
          2px gap, packed hard against the wordmark, which left **289px of empty
          space on the right** and made the bar look as though it had slid
          off-centre. Reported by the owner 2026-08-18 as "cramped and skewed
          left"; measured before touching it, because the notes above rightly
          warn that this row has run out of width before.

          MEASURED AT 1920px, LITHUANIAN, SIGNED OUT: logo 224, links 399,
          actions 304 — against 1216 of inner width. The slack is real, and this
          change spends it on separation rather than on new items.

          ⚠️ The narrowest case is still Lithuanian while SIGNED IN, where
          `HeaderAccount` swaps a 98px button for a name up to 5rem wide.
          Re-measure there before adding anything to the row.
        */}
        {/*
          ⚠️ `justify-center` WITH A REAL GAP, and the history matters because
          both of the obvious answers have already been tried and rejected here.

          It was `justify-center gap-1` once, and the owner called it a clump —
          rightly: five labels 4px apart read as one long word. It became
          `justify-between`, which was correct while the row also held 311px of
          actions and the navigation had 633px to spread over. Those actions are
          in the strip above now, so the same rule spreads five labels across
          961px — measured, the gaps came out at ~118px each, which is not five
          destinations either, it is five islands.

          A fixed 2rem gap is what actually reads as a menu: 487px of labels plus
          128px of gaps = 615px, centred, with ~170px spare on each side at the
          narrowest screen this row is shown on.

          `self-stretch` and `items-stretch` so each link fills the row's full
          height — that is what lets the active underline sit ON the header's own
          bottom border rather than floating above it.
        */}
        <nav className="hidden flex-1 items-stretch justify-center gap-8 self-stretch px-6 xl:flex">
          {links.map((link) => {
            const active = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={clsx(
                  // 16px at weight 600, up from 14px at 500 — the owner's ask,
                  // affordable only because the actions moved to the strip
                  // above. `px-2` is back too; it was squeezed to `px-1` when
                  // this row was fighting for single digits of width.
                  "relative flex items-center whitespace-nowrap px-2 text-base font-semibold transition-colors",
                  active
                    ? // AN UNDERLINE, NOT A PILL. The amber pill was legible but
                      // it read as a button among five links, and at 16px it
                      // grew into a slab. A rule under the label is the plainer
                      // convention and leaves the type itself to do the work.
                      "text-amber-700 after:absolute after:inset-x-2 after:-bottom-px after:h-[3px] after:rounded-t-full after:bg-amber-500"
                    : // Amber on hover, not grey. Grey said only "this is a
                      // control"; the brand colour says which control, and it
                      // matches the underline the active page already wears —
                      // so hovering previews where you are about to land.
                      "text-char-800 hover:text-amber-700"
                )}
              >
                {link.label}
              </Link>
            );
          })}
          {/* ONE BUTTON WHERE THERE WERE FOUR ICONS AND AN AMBER CTA — 2026-08-13,
              measured, not estimated. At 1280px in Lithuanian the two removed
              items cost 328px between them (232 for "Gauti nemokamą pasiūlymą",
              96 for the icon strip) against 50px of slack in the whole row.
              ContactMenu costs ~110px and carries more: the email address and
              the Telegram handle, which four glyphs could not show at all.

              The CTA is not gone, it is the last item in that menu with the
              same label and the same destination. It had to go somewhere —
              dropping it outright would leave /search, /plans, /shipping and
              /about with no call to action, since the hero that carries one
              exists only on the home page.

              WHAT THE ROOM IS FOR: the videos section, already agreed. Do not
              spend it on anything else without re-measuring in Lithuanian while
              signed in — that is the case with the least slack. */}
        </nav>

        {/* The actions used to sit here, in a third zone on the right. They are
            in the strip above now — see the note at the top of this file for the
            width measurement that forced the move.

            ⚠️ THIS EMPTY BOX IS LOAD-BEARING, and deleting it as dead markup
            would visibly shift the navigation. `flex-1` centres the nav within
            what is LEFT of the row, and with the actions gone that is everything
            to the right of the wordmark — so "centred" landed 112px right of the
            page's true centre. Matching the wordmark's width on the other side
            makes the two flanks equal, which is the only thing that puts the
            menu under the middle of the page. Sized in `rem` to track the
            wordmark: 14rem is its measured 224px at this breakpoint. */}
        <div className="hidden w-56 shrink-0 xl:block" aria-hidden />

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          // `ml-auto` because this button used to be the last of three items in
          // a row that ended on the right; with the actions gone it would sit
          // against the wordmark instead.
          className="ml-auto flex h-11 w-11 items-center justify-center rounded-full text-char-700 hover:bg-char-100 xl:hidden"
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
              people are using a thumb.

              Email and Telegram lead, so this row carries the same channels the
              desktop ContactMenu does rather than a subset — those two are the
              ones people actually write to. Six 44px targets plus gaps come to
              284px against 335px of content width on a 375px screen. */}
          <div className="mt-3 flex items-center gap-1 px-1">
            <a
              href={CONTACT_HREF.email}
              aria-label={SITE.email}
              className="flex h-11 w-11 items-center justify-center rounded-full text-char-600 hover:bg-char-100 hover:text-amber-600"
            >
              <Envelope size={22} />
            </a>
            <a
              href={CONTACT_HREF.telegram}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={SITE.telegram.display}
              className="flex h-11 w-11 items-center justify-center rounded-full text-char-600 hover:bg-char-100 hover:text-amber-600"
            >
              <TelegramLogo size={22} />
            </a>
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
              className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-full bg-amber-600 px-4 py-3 text-sm font-semibold text-white"
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
