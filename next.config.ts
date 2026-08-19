import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

/**
 * Content-Security-Policy: whitelist of what the browser may load and where
 * it may send data. Every entry below maps to something the site really uses —
 * before widening one, name the feature that needs it.
 *
 * - script-src: Next's own bootstrap scripts are inline, hence
 *   'unsafe-inline'. (The stricter nonce-based setup is deliberately deferred:
 *   it requires per-request HTML and interacts badly with static prerendering,
 *   and the codebase has no XSS sinks — no dangerouslySetInnerHTML anywhere —
 *   so the marginal risk is low. Revisit in Phase 2 when pages become dynamic
 *   anyway.) googletagmanager = GA4 (consent-gated), google.com + gstatic =
 *   reCAPTCHA v3.
 * - connect-src: GA4 sends beacons to regional *.google-analytics.com hosts;
 *   googletagmanager also self-fetches config. www.google.com is reCAPTCHA's
 *   token verification. R2 is the case-file bucket — see R2_ORIGIN below.
 * - img-src https:: vehicle photos come from Copart/IAAI CDNs via Apibara,
 *   whose hostnames vary and aren't ours to pin. GA's tracking pixel too.
 *   Case-file photos served from R2 fall under the same wildcard.
 * - media-src: case-file videos. Without it these fall through to
 *   default-src 'self' and every <video> from the bucket is blocked.
 * - frame-src: reCAPTCHA's invisible iframe.
 * - frame-ancestors 'none': nobody may embed this site (clickjacking).
 * - form-action 'self': forms may only post back to us.
 */

/**
 * The case-file bucket, as an origin the browser may talk to.
 *
 * Case-file uploads go from the browser STRAIGHT to R2 on a presigned URL —
 * the bytes never pass through our server, which is the only way a 150 MB
 * loading video gets past a serverless body limit. That makes the bucket a
 * cross-origin destination, and connect-src is what decides whether the
 * request is allowed to leave at all.
 *
 * ⚠️ Every layer of this was proved by script before anyone clicked the
 * button, and scripts are not subject to CSP. The first real upload from a
 * page was refused by the browser before it hit the network: presigned URL
 * issued, database row written, PUT blocked, one dead `order_files` row with
 * a null `uploadedAt`. Videos failed the same way for the same reason.
 *
 * Read from the environment so the account id isn't duplicated here, with a
 * wildcard fallback rather than nothing: `headers()` is evaluated at BUILD
 * time, so a deployment where R2_ENDPOINT is only a runtime variable would
 * otherwise emit a policy that silently forbids every upload and every video
 * — the failure we just spent an afternoon on. The fallback grants reach to
 * Cloudflare R2 hosts only, and when R2 is unconfigured there are no R2 URLs
 * on any page for it to reach.
 *
 * ⚠️ TWO origins, not one, and the second is the one that matters.
 * `R2_ENDPOINT` is the ACCOUNT host, but the SDK signs VIRTUAL-HOST URLs with
 * the bucket as a subdomain (`smartautobid-orders.<account>.eu.r2…`), and CSP
 * host matching is exact — the account host alone permits nothing the site
 * actually requests. A CSP `*.host` pattern does not match bare `host`
 * either, so both forms are listed. The wildcard is bounded to our own
 * account, so it widens to our other buckets and nobody else's.
 */
const R2_ORIGINS = (() => {
  const fallback = ["https://*.r2.cloudflarestorage.com"];
  const endpoint = process.env.R2_ENDPOINT?.trim();
  if (!endpoint) return fallback;
  try {
    const { protocol, host } = new URL(endpoint);
    return [`${protocol}//${host}`, `${protocol}//*.${host}`];
  } catch {
    return fallback;
  }
})().join(" ");

const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://www.googletagmanager.com https://www.google.com https://www.gstatic.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  `media-src 'self' blob: ${R2_ORIGINS}`,
  "font-src 'self' data:",
  `connect-src 'self' https://www.google-analytics.com https://*.google-analytics.com https://*.analytics.google.com https://www.googletagmanager.com https://www.google.com ${R2_ORIGINS}`,
  "frame-src https://www.google.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  /**
   * ⚠️ PRODUCTION ONLY, and the exception is what makes phone-testing possible.
   *
   * `upgrade-insecure-requests` rewrites every `http://` subresource to
   * `https://` — the right belt-and-braces on the real site, which is always
   * behind TLS. But the dev server speaks plain http, and when a phone on the
   * LAN opens `http://192.168.x.x:3215` the browser upgrades every stylesheet
   * and script request to an https origin nothing answers on. The page arrives
   * (the document itself is never upgraded) and everything else silently dies:
   * Times-New-Roman HTML with blue links, identically in Chrome and Safari.
   *
   * It never bit on the PC because browsers treat `localhost` as a trustworthy
   * origin and skip the upgrade there — which is exactly why this survived
   * every desktop check and only surfaced the day a phone joined in.
   */
  ...(process.env.NODE_ENV === "production" ? ["upgrade-insecure-requests"] : []),
].join("; ");

const SECURITY_HEADERS = [
  { key: "Content-Security-Policy", value: CSP },
  // Belt-and-braces duplicate of frame-ancestors for older user agents.
  { key: "X-Frame-Options", value: "DENY" },
  // Never MIME-sniff a response into a different type than declared.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Cross-origin requests get the origin only, never the full URL — so
  // outbound links (Copart, IAAI, wa.me) don't learn our paths or params.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // The site uses none of these browser capabilities; say so explicitly.
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
];

const nextConfig: NextConfig = {
  /**
   * DEV ONLY — lets a phone on the same Wi-Fi load the dev server's assets.
   *
   * ⚠️ WITHOUT THIS THE PHONE GETS RAW HTML WITH NO CSS AND DIAGNOSES ITSELF
   * WRONGLY. Next 16 blocks cross-origin requests to `/_next/*` in development,
   * so opening `http://192.168.x.x:3215` served the page but refused every
   * stylesheet and script — Times New Roman, blue links, nothing interactive.
   * It looks like the site is broken; it is the dev server being strict.
   * Production is untouched: the option only affects `next dev`.
   *
   * The private 192.168.* range rather than one address, because DHCP reassigns
   * the machine's IP and a one-address allowance would break on the next lease.
   */
  allowedDevOrigins: ["192.168.*.*"],
  images: {
    formats: ["image/avif", "image/webp"],
  },
  experimental: {
    globalNotFound: true,
  },
  async headers() {
    return [{ source: "/(.*)", headers: SECURITY_HEADERS }];
  },
};

export default withNextIntl(nextConfig);
