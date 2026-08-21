import type { Metadata } from "next";
import { Inter, Manrope } from "next/font/google";
import { NextIntlClientProvider, hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { routing } from "@/i18n/routing";
import { SITE } from "@/shared/config/site";
import Header from "@/shared/layout/Header";
import Footer from "@/shared/layout/Footer";
import WhatsAppButton from "@/shared/layout/WhatsAppButton";
import JsonLdScript from "@/shared/seo/JsonLdScript";
import { organizationJsonLd, webSiteJsonLd } from "@/shared/seo/jsonLd";
import CookieConsent from "@/modules/consent/components/CookieConsent";
import HeaderAccount from "@/modules/auth/components/HeaderAccount";
import "../globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin", "latin-ext", "cyrillic", "cyrillic-ext"],
  weight: ["400", "500", "600"],
  display: "swap",
});

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin", "latin-ext", "cyrillic", "cyrillic-ext"],
  weight: ["600", "700", "800"],
  display: "swap",
});

export async function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Metadata" });
  const title = t("title");
  const description = t("description");
  return {
    metadataBase: new URL(SITE.url),
    title,
    description,
    openGraph: {
      title,
      description,
      url: SITE.url,
      siteName: SITE.name,
      locale,
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  setRequestLocale(locale);
  const t = await getTranslations("Nav");

  return (
    <html
      lang={locale}
      className={`${inter.variable} ${manrope.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-background text-foreground">
        {/* Data islands for crawlers — application/ld+json is never executed,
            so the CSP's script rules do not apply. See shared/seo/jsonLd.ts. */}
        <JsonLdScript data={organizationJsonLd()} />
        <JsonLdScript data={webSiteJsonLd()} />
        <NextIntlClientProvider>
          {/* First tabbable thing on every page, invisible until keyboard
              focus lands on it: five nav links, the contact menu and the
              account controls sit before the content on every single page,
              and a keyboard user should not have to walk them each time. */}
          <a
            href="#main-content"
            className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-xl focus:bg-white focus:px-4 focus:py-2.5 focus:text-sm focus:font-semibold focus:text-char-900 focus:shadow-lg"
          >
            {t("skipToContent")}
          </a>
          {/* The account button is injected rather than imported: Header
              lives in shared/, which may not depend on modules/. */}
          <Header
            account={<HeaderAccount variant="desktop" />}
            accountMobile={<HeaderAccount variant="mobile" />}
          />
          {/* tabIndex so the skip link's fragment jump moves real focus here;
              outline-none because a page-sized focus ring is the one place
              the global :focus-visible rule would mislead. */}
          <main id="main-content" tabIndex={-1} className="flex-1 outline-none">
            {children}
          </main>
          <Footer />
          <WhatsAppButton />
          <CookieConsent />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
