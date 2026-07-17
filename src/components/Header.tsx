"use client";

import { useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { List, X, ArrowRight, Phone } from "@phosphor-icons/react/dist/ssr";
import { clsx } from "clsx";
import LanguageSwitcher from "./LanguageSwitcher";

const PHONE_DISPLAY = "+1 (912) 561-2347";
const PHONE_E164 = "+19125612347";

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
    { href: "/shipping", label: t("shipping") },
    { href: "/about", label: t("about") },
    { href: "/contact", label: t("contact") },
  ];

  return (
    <header className="sticky top-0 z-50 border-b border-char-200/70 bg-background/90 backdrop-blur-md">
      <div className="mx-auto flex h-18 max-w-7xl items-center justify-between gap-4 px-5 py-3 sm:px-8">
        <Link href="/" className="flex shrink-0 items-center gap-2.5">
          <span className="relative h-10 w-10 overflow-hidden rounded-lg">
            <Image
              src="/images/logo-mark.jpg"
              alt="AmberAutoBid"
              fill
              sizes="40px"
              className="object-cover [mix-blend-mode:multiply]"
              priority
            />
          </span>
          <span className="font-[family-name:var(--font-heading)] text-lg font-extrabold tracking-tight text-char-900">
            Amber<span className="text-amber-500">AutoBid</span>
          </span>
        </Link>

        <nav className="hidden items-center gap-1 lg:flex">
          {links.map((link) => {
            const active = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={clsx(
                  "rounded-full px-3.5 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-amber-50 text-amber-700"
                    : "text-char-600 hover:bg-char-100 hover:text-char-900"
                )}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        <div className="hidden items-center gap-3 lg:flex">
          <a
            href={`tel:${PHONE_E164}`}
            className="hidden items-center gap-1.5 rounded-full px-3 py-2 text-sm font-medium text-char-600 transition-colors hover:bg-char-100 hover:text-char-900 xl:flex"
          >
            <Phone size={16} weight="fill" className="text-amber-500" />
            {PHONE_DISPLAY}
          </a>
          <LanguageSwitcher />
          <Link
            href="/contact"
            className="group inline-flex items-center gap-1.5 rounded-full bg-amber-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-amber-900/20 transition-all hover:bg-amber-600 hover:shadow-md"
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
          className="flex h-10 w-10 items-center justify-center rounded-full text-char-700 hover:bg-char-100 lg:hidden"
        >
          {open ? <X size={22} /> : <List size={22} />}
        </button>
      </div>

      {open && (
        <div className="border-t border-char-200/70 bg-background px-5 pb-6 pt-2 lg:hidden">
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
            <Link
              href="/contact"
              className="inline-flex items-center gap-1.5 rounded-full bg-amber-500 px-4 py-2.5 text-sm font-semibold text-white"
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
