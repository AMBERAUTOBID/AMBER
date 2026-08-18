import type { AppLocale } from "@/i18n/routing";

/**
 * The flag beside a language.
 *
 * ⚠️ DRAWN, NEVER THE EMOJI — for exactly the reason the made-in-USA badge is:
 * `🇱🇹` is not a glyph, it is the regional-indicator pair `L` + `T`, and Windows
 * ships no flag glyphs, so Segoe UI Emoji renders the two letters instead. The
 * badge read "us Pagaminta JAV" for every Windows visitor until it was drawn as
 * an SVG; a language menu reading "lt Lietuvių" would be the same bug twice.
 *
 * ⚠️ **A FLAG IS A COUNTRY, AND THESE LABEL LANGUAGES** — English is not the
 * United Kingdom's private property. The convention is used anyway because it
 * is what this audience expects from every other site they use, and because a
 * flag is recognisable at 18px where a language name is not. The accessible
 * name stays the language, never the country: each flag is `aria-hidden` and
 * the text beside it does the talking.
 *
 * The Union Jack is the simplified construction — the diagonals are not
 * counterchanged. At the size this renders, the difference is invisible, and
 * the full version needs three clip paths to draw a detail nobody can see.
 */

const RING = "shrink-0 rounded-[2px] ring-1 ring-char-900/15";

function Lithuania({ size }: { size: number }) {
  // 3:5, three equal bands.
  return (
    <svg viewBox="0 0 5 3" width={size} height={size * 0.6} className={RING} aria-hidden focusable="false">
      <rect width="5" height="1" y="0" fill="#fdb913" />
      <rect width="5" height="1" y="1" fill="#006a44" />
      <rect width="5" height="1" y="2" fill="#c1272d" />
    </svg>
  );
}

function Russia({ size }: { size: number }) {
  // 2:3, three equal bands.
  return (
    <svg viewBox="0 0 9 6" width={size} height={size * (6 / 9)} className={RING} aria-hidden focusable="false">
      <rect width="9" height="2" y="0" fill="#ffffff" />
      <rect width="9" height="2" y="2" fill="#0039a6" />
      <rect width="9" height="2" y="4" fill="#d52b1e" />
    </svg>
  );
}

function UnitedKingdom({ size }: { size: number }) {
  // 1:2, the flag of the United Kingdom for the English locale.
  return (
    <svg viewBox="0 0 60 30" width={size} height={size / 2} className={RING} aria-hidden focusable="false">
      <rect width="60" height="30" fill="#012169" />
      <path d="M0,0 L60,30 M60,0 L0,30" stroke="#ffffff" strokeWidth="6" />
      <path d="M0,0 L60,30 M60,0 L0,30" stroke="#c8102e" strokeWidth="3" />
      <path d="M30,0 V30 M0,15 H60" stroke="#ffffff" strokeWidth="10" />
      <path d="M30,0 V30 M0,15 H60" stroke="#c8102e" strokeWidth="6" />
    </svg>
  );
}

export default function LocaleFlag({
  locale,
  size = 18,
}: {
  locale: AppLocale;
  /** Rendered width in pixels; height follows each flag's own ratio. */
  size?: number;
}) {
  if (locale === "lt") return <Lithuania size={size} />;
  if (locale === "ru") return <Russia size={size} />;
  return <UnitedKingdom size={size} />;
}
