import { describe, expect, it } from "vitest";
import { jsonLdString, organizationJsonLd, webSiteJsonLd } from "./jsonLd";
import { SITE } from "@/shared/config/site";

describe("organizationJsonLd", () => {
  const org = organizationJsonLd();

  it("states both names — the brand and the legal entity behind it", () => {
    expect(org.name).toBe("SmartAutoBid");
    expect(org.legalName).toBe("Smart Auto Bid LLC");
  });

  it("restates the site config rather than carrying its own copies", () => {
    expect(org.telephone).toBe(SITE.phone.e164);
    expect(org.email).toBe(SITE.email);
    expect(org.url).toBe(SITE.url);
  });

  it("lists only identity profiles in sameAs — never the wa.me chat link", () => {
    expect(org.sameAs.length).toBeGreaterThan(0);
    for (const href of org.sameAs) {
      expect(href).not.toContain("wa.me");
      expect(href.startsWith("https://")).toBe(true);
    }
  });

  it("gives the registered Savannah address", () => {
    expect(org.address.addressCountry).toBe("US");
    expect(org.address.postalCode).toBe("31415");
  });
});

describe("webSiteJsonLd", () => {
  const site = webSiteJsonLd();

  it("points the SearchAction at the real free-text parameter", () => {
    expect(site.potentialAction.target.urlTemplate).toBe(
      `${SITE.url}/search?q={search_term_string}`
    );
  });

  it("declares the three locales, from routing rather than a private list", () => {
    expect(site.inLanguage).toEqual(["en", "ru", "lt"]);
  });

  it("links back to the organization by @id", () => {
    expect(site.publisher["@id"]).toBe(`${SITE.url}/#organization`);
  });
});

describe("jsonLdString", () => {
  it("escapes < so a value can never close the script tag", () => {
    const out = jsonLdString({ name: "</script><script>alert(1)</script>" });
    expect(out).not.toContain("</script>");
    expect(out).toContain("\\u003c/script");
  });
});
