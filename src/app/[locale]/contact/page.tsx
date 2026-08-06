import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import Container from "@/shared/ui/Container";
import Reveal from "@/shared/ui/Reveal";
import ContactForm from "@/modules/leads/components/ContactForm";
import SectionHeading from "@/shared/ui/SectionHeading";
import FAQAccordion from "@/modules/leads/components/FAQAccordion";
import {
  Phone,
  WhatsappLogo,
  TelegramLogo,
  EnvelopeSimple,
} from "@phosphor-icons/react/dist/ssr";
import { SITE, CONTACT_HREF } from "@/shared/config/site";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Contact" });
  return { title: t("hero.title") };
}

/**
 * Note what this page does NOT read: `searchParams`. The Coming Soon plan
 * cards link here with `?plan=<key>`, but touching searchParams on the server
 * opts the whole page out of static generation — measured, not assumed: it
 * flipped /contact from ● to ƒ in the build output the moment it was added.
 * This is a page SEO depends on, so ContactForm reads the parameter on the
 * client after hydration instead, the same trade the header makes (§6a).
 */
export default async function ContactPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Contact");
  const tc = await getTranslations("Contact.channels");
  const tf = await getTranslations("Contact.faq");
  const faqItems = tf.raw("items") as { question: string; answer: string }[];

  const channels = [
    {
      icon: Phone,
      label: tc("phone"),
      value: SITE.phone.display,
      href: CONTACT_HREF.tel,
    },
    {
      icon: WhatsappLogo,
      label: tc("whatsapp"),
      value: SITE.phone.display,
      href: CONTACT_HREF.whatsapp,
    },
    {
      icon: TelegramLogo,
      label: tc("telegram"),
      value: SITE.telegram.display,
      href: CONTACT_HREF.telegram,
    },
    {
      icon: EnvelopeSimple,
      label: tc("email"),
      value: SITE.email,
      href: CONTACT_HREF.email,
    },
  ];

  return (
    <section className="bg-gradient-to-b from-amber-50/60 via-background to-background py-16 sm:py-20">
      <Container>
        <Reveal className="max-w-2xl">
          <span className="inline-flex items-center rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-amber-700">
            {t("hero.eyebrow")}
          </span>
          <h1 className="mt-5 text-4xl font-extrabold tracking-tight text-char-900 sm:text-5xl">
            {t("hero.title")}
          </h1>
          <p className="mt-5 text-lg leading-relaxed text-char-600">
            {t("hero.subtitle")}
          </p>
        </Reveal>

        <div className="mt-12 grid grid-cols-1 gap-8 lg:grid-cols-5">
          <Reveal delay={0.05} className="lg:col-span-3">
            <div className="rounded-3xl border border-char-200 bg-white p-7 sm:p-9">
              <ContactForm />
            </div>
          </Reveal>

          <Reveal delay={0.1} className="lg:col-span-2">
            <div className="rounded-3xl bg-char-900 p-7 sm:p-9">
              <h2 className="text-lg font-bold text-white">{t("channels.title")}</h2>
              <ul className="mt-6 space-y-3">
                {channels.map((c) => (
                  <li key={c.label}>
                    <a
                      href={c.href}
                      target={c.href.startsWith("http") ? "_blank" : undefined}
                      rel={
                        c.href.startsWith("http")
                          ? "noopener noreferrer"
                          : undefined
                      }
                      className="group flex items-center gap-3.5 rounded-xl border border-white/10 bg-white/5 px-4 py-3.5 transition-colors hover:border-amber-500/40 hover:bg-white/10"
                    >
                      <c.icon
                        size={22}
                        weight="fill"
                        className="shrink-0 text-amber-500"
                        aria-hidden
                      />
                      <span className="min-w-0">
                        <span className="block text-xs text-char-400">
                          {c.label}
                        </span>
                        <span className="block truncate text-sm font-medium text-white">
                          {c.value}
                        </span>
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </Reveal>
        </div>

        <div className="mt-20">
          <SectionHeading
            eyebrow={tf("eyebrow")}
            title={tf("title")}
            subtitle={tf("subtitle")}
          />
          <Reveal delay={0.05} className="mx-auto mt-8 max-w-3xl">
            <FAQAccordion items={faqItems} />
          </Reveal>
        </div>
      </Container>
    </section>
  );
}
