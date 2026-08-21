import fs from "node:fs";
import path from "node:path";
import { Font } from "@react-pdf/renderer";

/**
 * The one font this document may use, and the reason it is not Helvetica.
 *
 * ⚠️ **react-pdf's built-in faces cannot spell Lithuanian.** The PDF standard
 * fonts are encoded WinAnsi (CP1252), which has no `ą č ę ė į š ų ū ž` — those
 * live in Latin Extended-A. Nor any Cyrillic, which the Russian invoice needs.
 * Left on the default, an invoice to a Lithuanian client renders his own name
 * with holes in it, and does so silently: no error, no warning, just a
 * document that looks like it was typed by somebody who does not care.
 *
 * DejaVu Sans is bundled rather than fetched because a font downloaded at
 * render time is a network call inside a money document — one timeout and the
 * invoice either fails or, worse, falls back and prints wrong.
 *
 * Copied into `public/fonts/` rather than read out of `node_modules`: Next's
 * dependency tracing follows imports, and `readFileSync` of a package path is
 * not an import. Files under `public/` are deployed whole.
 *
 * The two faces cost ~1.4 MB in the repository. Subsetting to the three
 * alphabets we actually ship would cut that by roughly 90%, and is worth doing
 * the day it matters — it does not matter yet.
 */
const FONT_DIR = path.join(process.cwd(), "public", "fonts");

/**
 * ⚠️ **Registered as data URLs, and the reason is a genuine trap.**
 *
 * react-pdf decides what a font source is by handing it to `new URL()`. On
 * Windows that means **`C:\dev\...\DejaVuSans.ttf` parses as a URL with the
 * protocol `c:`**, so the font is fetched rather than read, the fetch fails,
 * and react-pdf carries on without it.
 *
 * What that failure looks like is the dangerous part. The document still names
 * DejaVu in its font table, so `/BaseFont` says the font is embedded, and
 * every ASCII character draws correctly. What silently disappears is exactly
 * `ą č ę ė į š ų ū ž`: `SĄSKAITA FAKTŪRA` prints as `SSKAITA FAKTRA` on an
 * invoice addressed to a Lithuanian, with no error anywhere.
 *
 * **And it is a development-only failure.** On Vercel the path is
 * `/var/task/public/fonts/...`, which does not parse as a URL, so it would
 * have worked in production and been broken only on the machine it was written
 * on — the shape of bug that gets "fixed" into something worse. A Buffer is no
 * good either: `Font.register` calls `.substring()` on the source. A data URL
 * is the one form that behaves identically on every platform.
 *
 * The base64 costs ~1 MB of string per face, once per process.
 */
function face(file: string): string {
  const bytes = fs.readFileSync(path.join(FONT_DIR, file));
  return `data:font/ttf;base64,${bytes.toString("base64")}`;
}

/**
 * Passed as a PROP to every <Text> in both invoice documents, because the
 * global route is unreliable: the renderer package ships dual ESM/CJS
 * builds, each with its OWN FontStore singleton, and a callback registered
 * on one instance is invisible to a layout run using the other — which is
 * how «Комиссию printed as «- on a dev render while an isolated script
 * wrapped cleanly. layout resolves node.props.hyphenationCallback FIRST,
 * so the prop wins regardless of which store instance is live.
 */
export const NO_HYPHENS = (word: string): string[] => [word];

/**
 * AT MODULE TOP LEVEL, not inside the register function — measured, not
 * guessed: registering during component render is TOO LATE (the layout
 * captures the callback before component bodies run), and the per-<Text>
 * hyphenationCallback prop is ignored by this react-pdf version entirely.
 * A top-level call runs at import time, which is always before any render
 * that could reach this module's documents. Without it the default
 * hyphenator splits «Комиссию after the « and prints «- on a Russian
 * invoice.
 */
Font.registerHyphenationCallback(NO_HYPHENS);

let registered = false;

export function registerInvoiceFonts(): void {
  if (registered) return;
  Font.register({
    family: "DejaVu",
    fonts: [
      { src: face("DejaVuSans.ttf"), fontWeight: 400 },
      { src: face("DejaVuSans-Bold.ttf"), fontWeight: 700 },
    ],
  });
  registered = true;
}

/**
 * Sampled from `globals.css`, not eyeballed.
 *
 * `amber600` and `char500` specifically: both are the contrast-corrected
 * values from `27f716a`. The lighter `amber-500` and `char-400` that preceded
 * them measure 4.00:1 and 3.65:1 on white — below AA. A PDF is not covered by
 * WCAG, but it is frequently printed on a cheap office printer and read by
 * somebody over forty, which is a harsher test than a browser.
 */
export const INK = {
  amber600: "#a8531b",
  amber500: "#c36624",
  amber50: "#fdf4ea",
  amber200: "#f5c896",
  char900: "#1a1817",
  char800: "#2c2a28",
  char700: "#434343",
  char600: "#504b48",
  char500: "#666260",
  char300: "#b3afab",
  char200: "#d5d3d0",
  char100: "#ececea",
  char50: "#f7f6f5",
  white: "#ffffff",
} as const;

/** The same trap as the fonts, and the same fix — an `<Image src>` path is
 * resolved through `new URL()` too, so it must not be a bare Windows path. */
export function invoiceLogo(): string {
  const bytes = fs.readFileSync(
    path.join(process.cwd(), "public", "images", "logo-mark-transparent.png")
  );
  return `data:image/png;base64,${bytes.toString("base64")}`;
}
