"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  CaretDown,
  ChatCircleDots,
  Envelope,
  Phone,
  TelegramLogo,
  ArrowRight,
} from "@phosphor-icons/react/dist/ssr";
import { clsx } from "clsx";
import { Link } from "@/i18n/navigation";
import { SITE, CONTACT_HREF, socialLinks } from "@/shared/config/site";
import { SOCIAL_ICON, SOCIAL_LABEL } from "./socialIcons";

/**
 * Every way to reach SmartAutoBid, behind one button.
 *
 * WHY IT REPLACED FOUR BARE ICONS. The header row is width-bound — measured in
 * Lithuanian at 1280px it had 50px spare signed out, 12px signed in — and four
 * icons spent 96px of it while saying only "we are on these networks". They
 * could not show the email address or the Telegram handle at all, so the two
 * channels the audience actually writes to were missing from the bar entirely.
 * One button costs ~110px and holds all of them, with the address and the
 * number readable rather than implied.
 *
 * The last item is the quote CTA, and that is deliberate. Removing the amber
 * button from the row (232px, the single largest item on it) would otherwise
 * have left `/search`, `/plans`, `/shipping` and `/about` with no call to
 * action at all — the hero carrying it only exists on the home page. Here it
 * keeps its own translated label and its destination, and stops shouting.
 *
 * Values come from `SITE`/`socialLinks()`, never retyped: an unset network is
 * absent rather than a live link to somebody else's profile. See site.ts.
 */
export default function ContactMenu() {
  const t = useTranslations("Nav");
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  // Pointerdown rather than click: a menu that survives until mouseup feels
  // stuck when you press outside it. Escape is the keyboard equivalent, and
  // both are registered only while the menu is open.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  // WhatsApp is a way to write to us, not a profile to follow, so it sits with
  // the phone number it *is* rather than among the social accounts.
  const socials = socialLinks();
  const whatsapp = socials.find((s) => s.network === "whatsapp");
  const profiles = socials.filter((s) => s.network !== "whatsapp");

  const itemClass =
    "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-char-700 transition-colors hover:bg-char-100 hover:text-char-900";

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={clsx(
          "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-2 text-sm font-medium transition-colors",
          open ? "bg-char-100 text-char-900" : "text-char-600 hover:bg-char-100 hover:text-char-900"
        )}
      >
        <ChatCircleDots size={17} weight="duotone" />
        {t("contact")}
        <CaretDown
          size={12}
          weight="bold"
          className={clsx("transition-transform", open && "rotate-180")}
        />
      </button>

      {open && (
        // Right-aligned and absolute: the button sits near the end of the row,
        // and a left-aligned panel would hang off the viewport.
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-2 w-64 overflow-hidden rounded-2xl border border-char-200 bg-white p-1.5 shadow-xl shadow-char-900/10"
          onClick={() => setOpen(false)}
        >
          <a role="menuitem" href={CONTACT_HREF.email} className={itemClass}>
            <Envelope size={17} className="shrink-0 text-char-400" />
            <span className="truncate">{SITE.email}</span>
          </a>
          <a role="menuitem" href={CONTACT_HREF.tel} className={itemClass}>
            <Phone size={17} className="shrink-0 text-char-400" />
            {SITE.phone.display}
          </a>
          {whatsapp && (
            <a
              role="menuitem"
              href={whatsapp.href}
              target="_blank"
              rel="noopener noreferrer"
              className={itemClass}
            >
              <WhatsappIcon />
              {SOCIAL_LABEL.whatsapp}
            </a>
          )}
          <a
            role="menuitem"
            href={CONTACT_HREF.telegram}
            target="_blank"
            rel="noopener noreferrer"
            className={itemClass}
          >
            <TelegramLogo size={17} className="shrink-0 text-char-400" />
            {SITE.telegram.display}
          </a>

          {profiles.length > 0 && (
            <div className="my-1.5 border-t border-char-100" role="separator" />
          )}
          {profiles.map(({ network, href }) => {
            const Icon = SOCIAL_ICON[network];
            return (
              <a
                key={network}
                role="menuitem"
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className={itemClass}
              >
                <Icon size={17} weight="fill" className="shrink-0 text-char-400" />
                {SOCIAL_LABEL[network]}
              </a>
            );
          })}

          <div className="my-1.5 border-t border-char-100" role="separator" />
          <Link
            role="menuitem"
            href="/contact"
            className="group flex items-center justify-between gap-2 rounded-lg bg-amber-50 px-3 py-2.5 text-sm font-semibold text-amber-700 transition-colors hover:bg-amber-100"
          >
            {t("cta")}
            <ArrowRight
              size={14}
              weight="bold"
              className="shrink-0 transition-transform group-hover:translate-x-0.5"
            />
          </Link>
        </div>
      )}
    </div>
  );
}

/** Kept beside its one caller: WhatsApp is the only entry drawn from the social
 * map while sitting outside the social section. */
function WhatsappIcon() {
  const Icon = SOCIAL_ICON.whatsapp;
  return <Icon size={17} weight="fill" className="shrink-0 text-char-400" />;
}
