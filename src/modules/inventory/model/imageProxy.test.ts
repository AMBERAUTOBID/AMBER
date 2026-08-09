import { describe, expect, it } from "vitest";
import { isProxyableImageUrl, proxiedImageUrl, ALLOWED_IMAGE_HOSTS } from "./imageProxy";

/**
 * This is a security boundary, not a formatting helper. Everything it accepts,
 * our server will fetch on an anonymous visitor's behalf — so the interesting
 * tests are the rejections.
 */
describe("isProxyableImageUrl", () => {
  it("accepts the four hosts measured in the mirror", () => {
    // 85,827 · 78,437 · 18,221 · 30 images respectively.
    expect(isProxyableImageUrl("https://vis.iaai.com/resizer?imageKeys=abc")).toBe(true);
    expect(isProxyableImageUrl("https://cs.copart.com/v1/AUTH_x/lpp/0809/img.jpg")).toBe(true);
    expect(isProxyableImageUrl("https://c-static.copart.com/img.jpg")).toBe(true);
    expect(isProxyableImageUrl("https://anvis.iaai.com/img.jpg")).toBe(true);
  });

  it("rejects a lookalike host that merely ENDS with an allowed domain", () => {
    // The classic way this check is got wrong. A suffix test would accept all
    // of these and hand an attacker our server as a fetching proxy.
    expect(isProxyableImageUrl("https://cs.copart.com.attacker.example/x.jpg")).toBe(false);
    expect(isProxyableImageUrl("https://evil-vis.iaai.com.example.net/x.jpg")).toBe(false);
    expect(isProxyableImageUrl("https://notcopart.com/x.jpg")).toBe(false);
  });

  it("rejects anything that is not HTTPS", () => {
    expect(isProxyableImageUrl("http://vis.iaai.com/x.jpg")).toBe(false);
    // 13 rows in auction_lot_images hold a source_url with no scheme at all.
    expect(isProxyableImageUrl("vis.iaai.com/x.jpg")).toBe(false);
    expect(isProxyableImageUrl("//vis.iaai.com/x.jpg")).toBe(false);
  });

  it("rejects the schemes that turn a fetcher into a file reader", () => {
    expect(isProxyableImageUrl("file:///etc/passwd")).toBe(false);
    expect(isProxyableImageUrl("data:image/png;base64,AAAA")).toBe(false);
    expect(isProxyableImageUrl("ftp://vis.iaai.com/x.jpg")).toBe(false);
  });

  it("rejects the addresses an SSRF is actually aimed at", () => {
    expect(isProxyableImageUrl("https://169.254.169.254/latest/meta-data/")).toBe(false);
    expect(isProxyableImageUrl("https://localhost/admin")).toBe(false);
    expect(isProxyableImageUrl("https://127.0.0.1:5432/")).toBe(false);
    expect(isProxyableImageUrl("https://10.0.0.5/internal")).toBe(false);
  });

  it("rejects malformed input rather than throwing", () => {
    expect(isProxyableImageUrl("")).toBe(false);
    expect(isProxyableImageUrl("not a url")).toBe(false);
    expect(isProxyableImageUrl("https://")).toBe(false);
  });

  it("is not fooled by credentials in the authority", () => {
    // `new URL` puts everything before the @ into the userinfo, so the hostname
    // really is the attacker's — the check must read hostname, not the string.
    expect(isProxyableImageUrl("https://vis.iaai.com@attacker.example/x.jpg")).toBe(false);
  });
});

describe("proxiedImageUrl", () => {
  it("routes an allowed image through our own origin", () => {
    const out = proxiedImageUrl("https://vis.iaai.com/resizer?imageKeys=a&width=845");
    expect(out.startsWith("/api/auction-image?u=")).toBe(true);
    // The query inside must be encoded, or `width` would arrive as a parameter
    // of OUR route rather than part of the upstream URL.
    expect(out).toContain(encodeURIComponent("https://vis.iaai.com/resizer?imageKeys=a&width=845"));
  });

  it("leaves a URL it cannot proxy exactly as it was", () => {
    // Returning it unchanged keeps today's behaviour working. Hiding the photo
    // would trade a hypothetical future breakage for a certain present one.
    const odd = "http://example.com/x.jpg";
    expect(proxiedImageUrl(odd)).toBe(odd);
  });

  it("round-trips through decoding", () => {
    const source = "https://cs.copart.com/v1/AUTH_x/lpp/0809/a b+c.jpg?x=1&y=2";
    const encoded = proxiedImageUrl(source).split("?u=")[1];
    expect(decodeURIComponent(encoded)).toBe(source);
  });

  it("keeps the allowlist small enough to review", () => {
    // A widening list is the failure mode here — each entry is another place our
    // server can be pointed at, so growth should be noticed.
    expect(ALLOWED_IMAGE_HOSTS.size).toBe(4);
  });
});
