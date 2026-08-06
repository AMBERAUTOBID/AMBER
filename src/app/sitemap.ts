import type { MetadataRoute } from "next";
import { routing } from "@/i18n/routing";
import { SITE } from "@/shared/config/site";

const BASE_URL = SITE.url;

/**
 * ⚠️ Must agree with each page's own `robots` metadata. A path listed here
 * but marked noindex tells crawlers to find a page and then not list it —
 * half a decision, and the confusing half. Every entry below is indexable.
 *
 * Deliberately absent: /login, /register, /account/*, /admin and the
 * password-reset pages (personal doorways, all noindex), and /vehicle/[vin]
 * (expiring auction lots, also disallowed in robots.ts).
 */
const PATHS = [
  "",
  "/search",
  "/plans",
  "/shipping",
  "/about",
  "/contact",
  "/privacy",
  "/terms",
];

function localizedPath(locale: string, path: string) {
  const prefix = locale === routing.defaultLocale ? "" : `/${locale}`;
  if (!path) return prefix ? `${BASE_URL}${prefix}` : `${BASE_URL}/`;
  return `${BASE_URL}${prefix}${path}`;
}

export default function sitemap(): MetadataRoute.Sitemap {
  return PATHS.map((path) => ({
    url: localizedPath(routing.defaultLocale, path),
    lastModified: new Date(),
    alternates: {
      languages: Object.fromEntries(
        routing.locales.map((locale) => [locale, localizedPath(locale, path)])
      ),
    },
  }));
}
