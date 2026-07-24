import type { MetadataRoute } from "next";
import { routing } from "@/i18n/routing";

const BASE_URL = "https://smartautobid.com";

const PATHS = [
  "",
  "/search",
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
