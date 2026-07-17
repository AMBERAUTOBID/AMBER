import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["en", "ru", "lt", "ka"],
  defaultLocale: "en",
  localePrefix: "as-needed",
});

export type AppLocale = (typeof routing.locales)[number];

export const localeNames: Record<AppLocale, string> = {
  en: "English",
  ru: "Русский",
  lt: "Lietuvių",
  ka: "ქართული",
};
