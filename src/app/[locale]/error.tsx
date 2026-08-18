"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { ArrowClockwise, WhatsappLogo, WarningOctagon } from "@phosphor-icons/react/dist/ssr";
import Container from "@/shared/ui/Container";
import { whatsappHref } from "@/shared/config/site";

/**
 * What a visitor sees when a page throws.
 *
 * ⚠️ THERE WAS NO ERROR BOUNDARY ANYWHERE ON THIS SITE UNTIL NOW, and the site
 * depends on a third-party aggregator that has been measured failing: the
 * related-lots endpoint took 12.5 s, then 16.5 s, on the same lot on 2026-08-17,
 * and a serverless function gives up before the longer of those. Without this
 * file, the visitor got Next's own error screen — untranslated, unbranded, and
 * offering nothing but a stack trace's absence. That reads as a broken company
 * rather than a supplier having a bad minute.
 *
 * The two actions are chosen for that specific failure. **Try again** is real:
 * `reset()` re-renders the segment, and an upstream timeout usually succeeds on
 * the second attempt. **WhatsApp** is the route a client would have taken
 * anyway, and it costs us nothing to keep it open when the site cannot answer.
 *
 * No apology, no "oops". It says what happened and what to do — the same rule
 * the rest of the copy follows.
 */
export default function LocaleError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("ErrorPage");

  useEffect(() => {
    // Server-side digests are the only handle on what actually failed once
    // this is deployed, so it goes to the console rather than being swallowed.
    console.error("Page error", error.digest ?? "", error.message);
  }, [error]);

  return (
    <section className="py-20 sm:py-28">
      <Container>
        <div className="mx-auto max-w-xl text-center">
          <span className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-amber-50 text-amber-700">
            <WarningOctagon size={26} weight="duotone" />
          </span>

          <h1 className="mt-6 font-[family-name:var(--font-heading)] text-3xl font-extrabold tracking-tight text-char-900 sm:text-4xl">
            {t("title")}
          </h1>
          <p className="mt-4 leading-relaxed text-char-600">{t("body")}</p>

          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <button
              type="button"
              onClick={reset}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-amber-600 px-6 py-3.5 text-sm font-semibold text-white shadow-sm shadow-amber-900/20 transition-colors hover:bg-amber-700"
            >
              <ArrowClockwise size={17} weight="bold" />
              {t("retry")}
            </button>
            <a
              href={whatsappHref(t("whatsappMessage"))}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 rounded-full border border-char-200 bg-white px-6 py-3.5 text-sm font-semibold text-char-800 transition-colors hover:border-amber-400 hover:text-amber-700"
            >
              <WhatsappLogo size={17} weight="fill" />
              {t("whatsapp")}
            </a>
          </div>

          {/* Shown only when there is one. A support conversation that starts
              with this code skips ten minutes of "which page was it?" */}
          {error.digest && (
            <p className="mt-8 font-mono text-xs text-char-500">
              {t("reference", { code: error.digest })}
            </p>
          )}
        </div>
      </Container>
    </section>
  );
}
