import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import {
  Gavel,
  ClockCounterClockwise,
  WhatsappLogo,
  EnvelopeSimple,
} from "@phosphor-icons/react/dist/ssr";
import { requireUser } from "@/modules/account/model/requireUser";
import { whatsappHref, CONTACT_HREF } from "@/shared/config/site";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Bids" });
  return { title: t("title"), robots: { index: false } };
}

/**
 * PLACEHOLDER — shipped ahead of the feature at the owner's explicit request
 * (2026-08-06), which deliberately bends the "no section without real data"
 * rule from §6a. The bend is kept honest: the empty states don't pretend a
 * feature is temporarily quiet, they describe how bidding actually works
 * today (owner-confirmed 2026-08-06): a client registers, takes a plan, then
 * sends us the car — lot link or VIN — by email or WhatsApp, and we place
 * the bid. A placeholder pointing at the real channels is a signpost, not a
 * false promise.
 *
 * When 2.3 lands, the two sections below become the real lists and the
 * contact banner goes. Keep the section split (active vs history): it
 * matches how the data will be shaped — a bid you can still act on is a
 * different thing from a record of one that closed.
 */
export default async function AccountBidsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireUser(locale, "/account/bids");

  const t = await getTranslations({ locale, namespace: "Bids" });

  return (
    <div className="max-w-2xl">
      <h1 className="font-[family-name:var(--font-heading)] text-3xl font-extrabold tracking-tight text-char-900">
        {t("title")}
      </h1>

      <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50/60 px-4 py-3">
        <p className="text-sm leading-relaxed text-char-700">{t("comingBanner")}</p>
        {/* Both real channels, side by side — clients attach the car info to
            whichever they already use. */}
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <a
            href={whatsappHref(t("whatsappPrefill"))}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-full bg-amber-500 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-amber-600"
          >
            <WhatsappLogo size={18} weight="fill" />
            {t("whatsappCta")}
          </a>
          <a
            href={CONTACT_HREF.email}
            className="inline-flex items-center gap-2 rounded-full border border-char-200 bg-white px-5 py-2.5 text-sm font-semibold text-char-800 transition-colors hover:border-amber-400 hover:text-amber-700"
          >
            <EnvelopeSimple size={18} weight="fill" />
            {t("emailCta")}
          </a>
        </div>
      </div>

      <section className="mt-8 rounded-2xl border border-char-200/70 bg-white p-6 dark:bg-char-100/5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-char-500">
          {t("activeHeading")}
        </h2>
        <div className="mt-5 flex flex-col items-center gap-2 py-6 text-center">
          <Gavel size={26} className="text-char-300" />
          <p className="text-sm text-char-600">{t("activeEmpty")}</p>
        </div>
      </section>

      <section className="mt-8 rounded-2xl border border-char-200/70 bg-white p-6 dark:bg-char-100/5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-char-500">
          {t("historyHeading")}
        </h2>
        <div className="mt-5 flex flex-col items-center gap-2 py-6 text-center">
          <ClockCounterClockwise size={26} className="text-char-300" />
          <p className="text-sm text-char-600">{t("historyEmpty")}</p>
        </div>
      </section>
    </div>
  );
}
