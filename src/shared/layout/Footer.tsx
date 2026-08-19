import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import {
  Phone,
  WhatsappLogo,
  TelegramLogo,
  EnvelopeSimple,
} from "@phosphor-icons/react/dist/ssr";
import Container from "../ui/Container";
import LanguageSwitcher from "./LanguageSwitcher";
import { SITE, CONTACT_HREF } from "@/shared/config/site";

export default async function Footer() {
  const tNav = await getTranslations("Nav");
  const tFooter = await getTranslations("Footer");
  const tChannels = await getTranslations("Contact.channels");
  const year = new Date().getFullYear();

  const links = [
    { href: "/", label: tNav("home") },
    { href: "/search", label: tNav("search") },
    { href: "/shipping", label: tNav("shipping") },
    { href: "/about", label: tNav("about") },
    { href: "/contact", label: tNav("contact") },
  ];

  const channels = [
    {
      icon: Phone,
      label: tChannels("phone"),
      value: SITE.phone.display,
      href: CONTACT_HREF.tel,
    },
    {
      icon: WhatsappLogo,
      label: tChannels("whatsapp"),
      value: SITE.phone.display,
      href: CONTACT_HREF.whatsapp,
    },
    {
      icon: TelegramLogo,
      label: tChannels("telegram"),
      value: SITE.telegram.display,
      href: CONTACT_HREF.telegram,
    },
    {
      icon: EnvelopeSimple,
      label: tChannels("email"),
      value: SITE.email,
      href: CONTACT_HREF.email,
    },
  ];

  return (
    <footer className="bg-char-900 text-char-200">
      <Container className="grid grid-cols-1 gap-10 py-16 sm:grid-cols-2 lg:grid-cols-4">
        <div className="sm:col-span-2 lg:col-span-1">
          <span className="font-[family-name:var(--font-heading)] text-xl font-extrabold tracking-tight text-white">
            Smart<span className="text-amber-500">AutoBid</span>
          </span>
          <p className="mt-4 max-w-xs text-sm leading-relaxed text-char-300">
            {tFooter("tagline")}
          </p>
          <div className="mt-6">
            <LanguageSwitcher dark />
          </div>
        </div>

        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wider text-char-400">
            {tFooter("linksTitle")}
          </h3>
          {/* ⚠️ THE PADDING IS THE TAP TARGET, AND THE ROW GAP PAYS FOR MOST OF
              IT. These were bare 17px-tall lines — a link exactly the height of
              its own type, which on a phone is a coin toss between two
              neighbours. `py-2` makes each one 36px without changing how it
              looks, and the gap drops from 3 to 1 to buy that back: the block
              goes 133px → 181px rather than 133px → 213px. Measured at 375px on
              2026-08-19, where the footer is 1,150px tall, so the 48px is under
              4% of it. */}
          <ul className="mt-4 space-y-1">
            {links.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="inline-block py-2 text-sm text-char-300 transition-colors hover:text-amber-400"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div className="sm:col-span-2 lg:col-span-2">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-char-400">
            {tFooter("contactTitle")}
          </h3>
          <ul className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {channels.map((c) => (
              <li key={c.label}>
                <a
                  href={c.href}
                  target={c.href.startsWith("http") ? "_blank" : undefined}
                  rel={c.href.startsWith("http") ? "noopener noreferrer" : undefined}
                  className="group flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3 transition-colors hover:border-amber-500/40 hover:bg-white/10"
                >
                  <c.icon
                    size={20}
                    weight="fill"
                    className="shrink-0 text-amber-500"
                    aria-hidden
                  />
                  <span className="min-w-0">
                    <span className="block text-xs text-char-400">{c.label}</span>
                    <span className="block truncate text-sm font-medium text-white">
                      {c.value}
                    </span>
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      </Container>

      <div className="border-t border-white/10">
        <Container className="flex flex-col gap-4 py-6 text-xs text-char-400">
          <p className="max-w-3xl leading-relaxed">{tFooter("disclaimer")}</p>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            {/* The two smallest links on the site — 16px tall — and the two a
                regulator is most likely to check somebody can actually reach.
                `-my-1.5` gives the padding back to the layout so the strip does
                not grow. */}
            <div className="-my-1.5 flex flex-wrap gap-x-5">
              <Link
                href="/privacy"
                className="inline-block py-1.5 transition-colors hover:text-amber-400"
              >
                {tFooter("legal.privacy")}
              </Link>
              <Link
                href="/terms"
                className="inline-block py-1.5 transition-colors hover:text-amber-400"
              >
                {tFooter("legal.terms")}
              </Link>
            </div>
            <p className="shrink-0 whitespace-nowrap">
              © {year} SmartAutoBid. {tFooter("rights")}
            </p>
          </div>
        </Container>
      </div>
    </footer>
  );
}
