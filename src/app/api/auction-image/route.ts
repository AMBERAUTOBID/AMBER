import { NextResponse } from "next/server";
import { ALLOWED_IMAGE_HOSTS, isProxyableImageUrl } from "@/modules/inventory/model/imageProxy";

/**
 * Serves an auction photo through our own origin.
 *
 * See `model/imageProxy.ts` for why this exists and why the allowlist is the
 * design. In short: 182,528 photos are hotlinked to Copart and IAAI, and a
 * Referer check on their side blanks every one of them at once.
 *
 * The rules here, each earning its place:
 *
 *  - The host is checked BEFORE the fetch, and AGAIN afterwards against the URL
 *    the response actually came from. `fetch` follows redirects, so the first
 *    check alone would let an allowed host bounce us anywhere it liked.
 *  - Only `image/*` is passed through. Without it this route would happily
 *    relay HTML or JSON from a CDN path, which is how a proxy becomes a way to
 *    launder someone else's content through our domain.
 *  - A timeout, because a hung upstream would otherwise hold a server
 *    connection open indefinitely, and there is one of these per photo.
 *  - No credentials are forwarded and none are sent. This is a public image.
 */

/** Long, because an auction photo never changes once published — the lot is
 * reshot as a new lot, not a new file. */
const CACHE_CONTROL = "public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400";
const UPSTREAM_TIMEOUT_MS = 10_000;
/** Guards against a mislabelled or hostile response streaming without end. */
const MAX_BYTES = 12 * 1024 * 1024;

export async function GET(request: Request) {
  const source = new URL(request.url).searchParams.get("u");

  if (!source || !isProxyableImageUrl(source)) {
    // Deliberately terse. Echoing the rejected URL back would turn this into a
    // reflection helper, and naming the allowed hosts tells a prober what to aim
    // for; the list is in the source for anyone who needs it.
    return NextResponse.json({ error: "Unsupported image source" }, { status: 400 });
  }

  let upstream: Response;
  try {
    upstream = await fetch(source, {
      // The auctions serve these to browsers, and some CDNs refuse a request
      // with no Accept at all.
      headers: { Accept: "image/avif,image/webp,image/*,*/*;q=0.8" },
      credentials: "omit",
      redirect: "follow",
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      cache: "no-store",
    });
  } catch {
    // A timeout or a network failure. 502 rather than 500: the fault is
    // upstream, and it keeps our own error monitoring honest.
    return NextResponse.json({ error: "Image upstream unavailable" }, { status: 502 });
  }

  // Re-check after redirects. `upstream.url` is where the body actually came
  // from, which is not necessarily where we aimed.
  try {
    if (!ALLOWED_IMAGE_HOSTS.has(new URL(upstream.url).hostname)) {
      return NextResponse.json({ error: "Redirected off the allowed hosts" }, { status: 502 });
    }
  } catch {
    return NextResponse.json({ error: "Image upstream unavailable" }, { status: 502 });
  }

  if (!upstream.ok || !upstream.body) {
    // Pass the upstream's own verdict through, so a 404 stays a 404 and the
    // browser can fall back to its broken-image handling rather than caching a
    // success it should not.
    return NextResponse.json({ error: "Image not available" }, { status: upstream.status === 404 ? 404 : 502 });
  }

  const contentType = upstream.headers.get("content-type") ?? "";
  if (!contentType.startsWith("image/")) {
    return NextResponse.json({ error: "Upstream did not return an image" }, { status: 502 });
  }

  const declared = Number(upstream.headers.get("content-length") ?? "0");
  if (declared > MAX_BYTES) {
    return NextResponse.json({ error: "Image too large" }, { status: 502 });
  }

  const headers = new Headers({
    "Content-Type": contentType,
    "Cache-Control": CACHE_CONTROL,
    // The bytes are the auction's, not ours, and this route must never be
    // mistaken for an endpoint that reveals anything about our origin.
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; img-src 'self' data:",
  });
  const length = upstream.headers.get("content-length");
  if (length) headers.set("Content-Length", length);

  return new NextResponse(upstream.body, { status: 200, headers });
}
