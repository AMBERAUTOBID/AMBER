/**
 * schema.org structured data — the facts, as JSON-LD objects.
 *
 * Everything here resolves from `shared/config/site.ts` and the i18n routing
 * table rather than restating a phone number or a locale list; those already
 * had their "seven hardcoded copies" era and this file must not start it
 * again. The legal identity (Smart Auto Bid LLC, Savannah GA) is the entity
 * the Terms already name — the marketing name and the legal name deliberately
 * differ, and schema.org has a field for exactly that split.
 *
 * Kept to Organization + WebSite on purpose. Service/Product markup makes
 * promises (prices, ratings, availability) that Google may render as rich
 * results, and the brand rules forbid claims we cannot yet back — see
 * [[project-brand-and-copy-rules]]. Add richer types only with the owner.
 */
import { routing } from "@/i18n/routing";
import { SITE, siteUrl } from "@/shared/config/site";

/** Public PROFILES only — wa.me is a chat deep-link, not an identity page,
 * and `sameAs` is Google's signal for "this is the same organisation". */
function profileUrls(): string[] {
  return [SITE.social.instagram, SITE.social.youtube, SITE.social.facebook].filter(
    (href): href is string => href !== null
  );
}

export function organizationJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": `${SITE.url}/#organization`,
    name: SITE.name,
    legalName: "Smart Auto Bid LLC",
    url: SITE.url,
    logo: siteUrl("/images/logo-mark-transparent.png"),
    email: SITE.email,
    telephone: SITE.phone.e164,
    address: {
      "@type": "PostalAddress",
      streetAddress: "289 Telfair Rd #I",
      addressLocality: "Savannah",
      addressRegion: "GA",
      postalCode: "31415",
      addressCountry: "US",
    },
    contactPoint: {
      "@type": "ContactPoint",
      contactType: "customer service",
      telephone: SITE.phone.e164,
      email: SITE.email,
      availableLanguage: [...routing.locales],
    },
    sameAs: profileUrls(),
  };
}

export function webSiteJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${SITE.url}/#website`,
    url: SITE.url,
    name: SITE.name,
    publisher: { "@id": `${SITE.url}/#organization` },
    inLanguage: [...routing.locales],
    potentialAction: {
      "@type": "SearchAction",
      // `q` is the search page's real free-text parameter — see
      // parseFreeTextQuery in modules/inventory/model/searchQuery.ts.
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${SITE.url}/search?q={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    },
  };
}

/**
 * Serialised for a `<script type="application/ld+json">` block.
 *
 * `<` is escaped so no value can ever close the script tag and start writing
 * markup — the classic JSON-in-HTML injection. Today every value is our own
 * config, but the serialiser should not depend on that staying true.
 */
export function jsonLdString(data: object): string {
  return JSON.stringify(data).replaceAll("<", "\\u003c");
}
