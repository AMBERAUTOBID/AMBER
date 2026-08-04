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

export default function Header() {
  const t = useTranslations("Nav");
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [prevPathname, setPrevPathname] = useState(pathname);

  if (pathname !== prevPathname) {
    setPrevPathname(pathname);
    setOpen(false);
  }

  const links = [
    { href: "/", label: t("home") },
    { href: "/search", label: t("search") },
    { href: "/plans", label: t("plans") },
    { href: "/shipping", label: t("shipping") },
    { href: "/about", label: t("about") },
    { href: "/contact", label: t("contact") },
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

        <div className="hidden flex-1 items-center gap-1.5 xl:flex">
          {links.map((link) => {
            const active = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={clsx(
                  "whitespace-nowrap rounded-full px-2.5 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-amber-50 text-amber-700"
                    : "text-char-600 hover:bg-char-100 hover:text-char-900"
                )}
              >
                {link.label}
              </Link>
            );
          })}
          <a
            href={CONTACT_HREF.tel}
            className="hidden items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-2 text-sm font-medium text-char-600 transition-colors hover:bg-char-100 hover:text-char-900 xl:flex"
          >
            <Phone size={16} weight="fill" className="text-amber-500" />
            {SITE.phone.display}
          </a>
          <LanguageSwitcher />
          {/* Static on purpose: reading the session cookie in the header
              would force every marketing page to render dynamically. The
              account page is where logged-in state gets decided. */}
          <Link
            href="/login"
            className="whitespace-nowrap rounded-full border border-char-200 bg-white px-3.5 py-2.5 text-sm font-semibold text-char-800 transition-colors hover:border-amber-400 hover:text-amber-700"
          >
            {t("login")}
          </Link>
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
          </nav>
          <div className="mt-4 flex items-center justify-between gap-3 border-t border-char-200/70 pt-4">
            <LanguageSwitcher />
            <div className="flex items-center gap-2">
              <Link
                href="/login"
                className="rounded-full border border-char-200 bg-white px-4 py-2.5 text-sm font-semibold text-char-800"
              >
                {t("login")}
              </Link>
              <Link
                href="/contact"
                className="inline-flex items-center gap-1.5 rounded-full bg-amber-500 px-4 py-2.5 text-sm font-semibold text-white"
              >
                {t("cta")}
                <ArrowRight size={15} weight="bold" />
              </Link>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
