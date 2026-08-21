/**
 * The email design tokens, and the constraints behind them.
 *
 * These mirror the brand scales in `app/globals.css` — amber sampled from the
 * logo at `#c36624`, charcoal at `#434343` — but they are **copied, not
 * imported**, and that is on purpose. Email HTML cannot use CSS custom
 * properties: Outlook renders through Word, and a `var()` there resolves to
 * nothing, which means a missing colour rather than a wrong one. Every value
 * below ends up written literally into a `style` attribute.
 *
 * If the site's brand colours change, change them here too. A drift between
 * the two is a cosmetic bug, not a functional one, which is exactly why it
 * would otherwise go unnoticed for a year.
 *
 * ## Contrast
 *
 * The same rule the site adopted in `27f716a`, and for the same measured
 * reasons — an email is read in worse conditions than a web page, not better:
 *
 * | pair | ratio | verdict |
 * |---|---|---|
 * | white on `amber-500` #c36624 | 4.00:1 | **fails** AA for body text |
 * | white on `amber-600` #a8531b | 5.36:1 | passes — filled buttons use this |
 * | `char-400` #8a8581 on white | 3.65:1 | **fails** — was every label here |
 * | `char-500` #666260 on white | 6.03:1 | passes — labels use this |
 * | `char-400` #8a8581 on #151312 | 4.85:1 | passes — dark mode keeps it |
 *
 * The last row is why `layout.ts` does not simply reuse these values in its
 * dark-mode block: no single grey clears 4.5:1 on both grounds. White needs a
 * luminance at or under 0.183 and the dark card needs at least 0.219, so the
 * two schemes genuinely need two greys.
 *
 * `accent` survives on the top rule and the progress bar because **no text
 * sits on either** — the same exemption the site's sliders and dots got.
 */

export const COLOR = {
  /** The 4 px header rule and the progress fill. Carries no text. */
  accent: "#c36624",
  /** Filled buttons and links: the darker step, so white type clears AA. */
  accentStrong: "#a8531b",
  accentBorder: "#f5c896",
  accentBg: "#fdf4ea",
  accentDeep: "#874015",

  /** The muted equivalents, used when `tone` is `neutral`. */
  mutedAccent: "#b3afab",
  mutedBg: "#f7f6f5",
  mutedBorder: "#d5d3d0",
  mutedDeep: "#666260",

  heading: "#201d1a",
  body: "#504b48",
  /**
   * Labels, notes and the footer. `char-500`, not `char-400` — see the table
   * above. Hierarchy against `body` now comes from size and weight rather
   * than from a grey that could not be read.
   */
  quiet: "#666260",
  wordmark: "#434343",

  card: "#ffffff",
  page: "#ededea",
  rule: "#ececea",
  footerBg: "#f7f6f5",
  buttonText: "#ffffff",
} as const;

/**
 * 600 px is the long-standing safe width: it fits the Outlook reading pane at
 * 96 DPI without the client introducing its own horizontal scrollbar.
 */
export const WIDTH = 600;

/**
 * Web fonts are not attempted.
 *
 * The site sets Manrope and Inter, and neither survives: Gmail strips
 * `@font-face`, and Outlook falls back to Times New Roman rather than to the
 * next font in the stack. A system stack renders identically everywhere and
 * costs nothing, and the brand is carried by colour, spacing and the mark —
 * not by a typeface nobody will see.
 */
export const FONT = "-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

/** For references, VINs and lot numbers, where digit alignment aids scanning. */
export const FONT_MONO = "ui-monospace,Consolas,Menlo,monospace";

/**
 * The header lockup: the shield mark and the SmartAutoBid wordmark, side by
 * side, cut from `logo-main.jpg` and composed horizontally.
 *
 * Horizontal rather than the square site logo because 600 px of width is
 * cheap in an email and vertical space is not — a stacked logo pushes the
 * heading below the fold of the Gmail preview pane.
 *
 * Drawn at 2× and displayed at half, so it stays sharp on a phone. Matted
 * onto white rather than transparent, and the header cell it sits in is
 * pinned to white in every colour scheme: the mark is charcoal line art, it
 * disappears on a dark ground, and Gmail's dark mode repaints backgrounds it
 * was never asked to.
 *
 * The wordmark being part of the image is why `alt` matters so much here —
 * with images blocked, that text is the entire sender identity, so it is
 * styled to read as a wordmark rather than left to the client's default.
 */
export const LOGO = { path: "/images/email-logo-lockup.png", width: 230, height: 48 } as const;

/** The two colour sets `tone` selects between. */
export function palette(tone: "brand" | "neutral") {
  return tone === "neutral"
    ? {
        rule: COLOR.mutedAccent,
        badgeBg: COLOR.mutedBg,
        badgeBorder: COLOR.mutedBorder,
        badgeText: COLOR.mutedDeep,
        panelBorder: COLOR.mutedAccent,
        bar: COLOR.mutedAccent,
        /** A bordered, uncoloured button: available, but not urging. */
        buttonBg: "transparent" as const,
        buttonBorder: COLOR.mutedBorder,
        buttonText: COLOR.wordmark,
      }
    : {
        rule: COLOR.accent,
        badgeBg: COLOR.accentBg,
        badgeBorder: COLOR.accentBorder,
        badgeText: COLOR.accentDeep,
        panelBorder: COLOR.accent,
        bar: COLOR.accent,
        buttonBg: COLOR.accentStrong,
        buttonBorder: COLOR.accentStrong,
        buttonText: COLOR.buttonText,
      };
}
