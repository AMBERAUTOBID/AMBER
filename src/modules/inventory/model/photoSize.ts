/**
 * Asking the auctions for a photo the size we are actually going to draw.
 *
 * ⚠️ MEASURED 2026-08-20, AND THE NUMBERS ARE THE WHOLE ARGUMENT. Every photo
 * on the site was being served at full resolution regardless of how small it
 * appeared. Copart publishes three variants of the same image:
 *
 *     _hrs   1280×960   276 KB
 *     _ful    960×720   164 KB
 *     _thb    144×108   4.7 KB
 *
 * A search page draws twenty cards about 400px wide and was loading twenty
 * `_hrs` files — **5.5 MB of photographs to fill 400px boxes**. A lot page's
 * thumbnail strip draws twelve 64px squares and was loading twelve `_ful`
 * files, about 2 MB, to do it: 164 KB spent on something displayed at the size
 * of a postage stamp, thirty-five times over.
 *
 * That is not a rendering nicety. This business sells to people browsing on
 * phones on mobile data, and the search page is the first thing they open.
 *
 * IAAI needs no variants — its CDN is already a resizer that takes `width` and
 * `height` in the query string, so the same idea is expressed by rewriting two
 * numbers.
 *
 * ⚠️ EXACT PATTERNS, NEVER A GUESS — the same discipline as the host allowlist
 * in `imageProxy.ts`, and for a related reason: a URL we transform wrongly is
 * a 404, which on a card is a broken photograph where a car should be. Anything
 * that does not match a shape we have actually measured is returned untouched,
 * so an unrecognised host or a new URL format degrades to today's behaviour
 * rather than to a hole in the page.
 */

/** What the image is for, which is what decides how big it needs to be. */
export type PhotoSize =
  /** The gallery's thumbnail strip — drawn at about 64px. */
  | "thumb"
  /** A result card or rail card — drawn at roughly 400px, 800 on a 2× screen. */
  | "card"
  /** The lot page's main photograph, where damage is actually inspected. */
  | "full";

/**
 * Copart's variant suffix per size.
 *
 * `full` keeps `_hrs` deliberately: the main photo on a lot page is the one a
 * buyer leans into to judge a dent, and it is a single image rather than twenty.
 * Saving 110 KB there would be trading the one thing the page exists for.
 */
const COPART_SUFFIX: Record<PhotoSize, string> = {
  thumb: "_thb",
  card: "_ful",
  full: "_hrs",
};

/**
 * The pixel width to ask IAAI's resizer for.
 *
 * `card` stays at the 845 the vendor already emits — measured, it is a sensible
 * size for a 400px card on a 2× screen, and changing a number that is already
 * right only invites a regression.
 */
const IAAI_WIDTH: Record<PhotoSize, number> = {
  thumb: 200,
  card: 845,
  full: 1600,
};

/** IAAI's own aspect ratio, taken from the URLs it emits (845×633). */
const IAAI_RATIO = 633 / 845;

/** `<hash>_hrs.jpg` and friends, anchored so a stray `_ful` in a path cannot match. */
const COPART_VARIANT = /_(?:hrs|ful|thb)\.jpg$/i;

/**
 * The same photograph, sized for the job.
 *
 * Returns the input unchanged whenever the URL is not one of the two shapes we
 * have measured — see the warning above.
 */
export function photoUrlForSize(sourceUrl: string, size: PhotoSize): string {
  let url: URL;
  try {
    url = new URL(sourceUrl);
  } catch {
    return sourceUrl;
  }

  const host = url.hostname.toLowerCase();

  // Copart: swap the variant suffix on the filename.
  if (host === "cs.copart.com" || host === "c-static.copart.com") {
    if (!COPART_VARIANT.test(url.pathname)) return sourceUrl;
    url.pathname = url.pathname.replace(COPART_VARIANT, `${COPART_SUFFIX[size]}.jpg`);
    return url.toString();
  }

  // IAAI: the CDN is a resizer, so ask it for fewer pixels.
  if (host === "vis.iaai.com" || host === "anvis.iaai.com") {
    // Only when it IS the resizer — `vis.iaai.com` also serves plain files, and
    // adding width/height to one of those would change nothing at best.
    if (!url.searchParams.has("imageKeys")) return sourceUrl;
    const width = IAAI_WIDTH[size];
    url.searchParams.set("width", String(width));
    url.searchParams.set("height", String(Math.round(width * IAAI_RATIO)));
    return url.toString();
  }

  return sourceUrl;
}
