/**
 * Serving auction photos through our own origin instead of hotlinking theirs.
 *
 * WHY THIS EXISTS. Every photo in the mirror is a direct link to the auction's
 * CDN — 182,528 of them across four hosts. The vendor is explicit that it does
 * not re-host media, so the day Copart or IAAI add a Referer check, every image
 * on the site goes blank at once. Not some: all of them, with no warning and no
 * fix short of shipping this. A competitor already proxies the same URLs, which
 * is the clearest signal available that it is worth doing before it is urgent.
 *
 * WHY THE ALLOWLIST IS THE WHOLE DESIGN. A route that fetches whatever URL it is
 * handed is an open proxy: it would let anyone use our server to reach internal
 * addresses, cloud metadata endpoints, or any third party, with our IP on the
 * request. So the hostname is checked against an exact list, measured off the
 * data rather than guessed:
 *
 *   vis.iaai.com        85,827      c-static.copart.com  18,221
 *   cs.copart.com       78,437      anvis.iaai.com           30
 *
 * EXACT equality, never a suffix test. `endsWith(".copart.com")` would accept
 * `cs.copart.com.attacker.example`, which is the classic way this check is got
 * wrong.
 */

import type { VehicleListItem } from "../api/types";

/** The four hosts that actually appear in `auction_lot_images`. Adding one is a
 * deliberate act: it widens what our server can be pointed at. */
export const ALLOWED_IMAGE_HOSTS = new Set([
  "vis.iaai.com",
  "anvis.iaai.com",
  "cs.copart.com",
  "c-static.copart.com",
]);

export const IMAGE_PROXY_PATH = "/api/auction-image";

/**
 * Whether we are willing to fetch this URL on a visitor's behalf.
 *
 * Also rejects anything that is not HTTPS. That is not only about transport:
 * 13 rows in the mirror hold a `source_url` with no scheme at all, and letting
 * those through would mean handing `fetch` a string we have not understood.
 */
export function isProxyableImageUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  return ALLOWED_IMAGE_HOSTS.has(url.hostname);
}

/**
 * The URL a page should render.
 *
 * A URL we cannot proxy is returned UNCHANGED rather than dropped. Today that
 * means it keeps working exactly as it does now; the alternative — hiding the
 * photo — would trade a hypothetical future breakage for a certain present one.
 */
export function proxiedImageUrl(sourceUrl: string): string {
  if (!isProxyableImageUrl(sourceUrl)) return sourceUrl;
  return `${IMAGE_PROXY_PATH}?u=${encodeURIComponent(sourceUrl)}`;
}

/**
 * Whether pages should route photos through us, from `IMAGE_PROXY`.
 *
 * DEFAULT OFF, and that is a cost decision rather than a technical one. A search
 * page shows twenty thumbnails; proxying them puts twenty requests per page view
 * through our own hosting instead of the auction's CDN, and the mirror holds
 * 182,528 images. Hotlinking works today and costs us nothing.
 *
 * So the route ships ready and unused. The day a Referer check appears — which
 * is the failure this exists for, and it takes every image down at once — the
 * fix is one environment variable, not a deploy of new code. Same shape as
 * `SEARCH_SOURCE`: the safe behaviour is the default, and the switch is
 * reversible in seconds.
 *
 * Unrecognised values mean off. A typo must not silently move all image traffic
 * onto our bill.
 */
export function shouldProxyImages(): boolean {
  return process.env.IMAGE_PROXY?.trim().toLowerCase() === "on";
}

/** `proxiedImageUrl` when the switch is on, the original URL when it is off. */
export function displayImageUrl(sourceUrl: string): string {
  return shouldProxyImages() ? proxiedImageUrl(sourceUrl) : sourceUrl;
}

/**
 * A lot whose photo URLs go through the proxy when the switch is on.
 *
 * Applied at the RENDER SITE, as the last transformation before the markup —
 * never inside a data mapping. The order is load-bearing: `photoUrlForSize`
 * recognises the CDNs' own URL shapes and returns anything else untouched, so a
 * URL wrapped into `/api/auction-image?u=…` first would silently stop being
 * resized — every card would fetch the full 276 KB `_hrs` file through our
 * server, undoing the size work while tripling the proxy's bill.
 *
 * Wrapping at the render site also keeps stored copies clean: the favourites
 * and bid-request snapshots persist whatever URL the lot carries, and a raw CDN
 * URL in the database stays true if the proxy route ever moves.
 *
 * Video `url`s are left alone: the route relays only `image/*`, so a proxied
 * video would 502 instead of play.
 *
 * Safe to apply to an item that is already wrapped — a relative
 * `/api/auction-image` path fails `new URL` inside the allowlist check and
 * passes through unchanged.
 */
export function withProxiedMedia<T extends Pick<VehicleListItem, "media">>(item: T): T {
  if (!shouldProxyImages() || !item.media) return item;
  const media = { ...item.media };
  if (media.thumbs) media.thumbs = media.thumbs.map(displayImageUrl);
  if (media.items) {
    media.items = media.items.map((m) => ({
      ...m,
      thumb: m.thumb === undefined ? undefined : displayImageUrl(m.thumb),
      large: m.large === undefined ? undefined : displayImageUrl(m.large),
      full: m.full === undefined ? undefined : displayImageUrl(m.full),
    }));
  }
  return { ...item, media };
}
