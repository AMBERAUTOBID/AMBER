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
 *   token verification.
 * - img-src https:: vehicle photos come from Copart/IAAI CDNs via Apibara,
 *   whose hostnames vary and aren't ours to pin. GA's tracking pixel too.
 * - frame-src: reCAPTCHA's invisible iframe.
 * - frame-ancestors 'none': nobody may embed this site (clickjacking).
 * - form-action 'self': forms may only post back to us.
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://www.googletagmanager.com https://www.google.com https://www.gstatic.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https://www.google-analytics.com https://*.google-analytics.com https://*.analytics.google.com https://www.googletagmanager.com https://www.google.com",
  "frame-src https://www.google.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  "upgrade-insecure-requests",
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
