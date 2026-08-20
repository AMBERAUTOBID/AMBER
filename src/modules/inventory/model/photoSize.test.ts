import { describe, expect, it } from "vitest";
import { photoUrlForSize } from "./photoSize";

/**
 * A URL this rewrites wrongly is a 404, and a 404 here is a broken photograph
 * on a card where a car should be. So the tests are mostly about REFUSING to
 * transform — the failure mode is silent and only visible on the page.
 *
 * Sample URLs are real shapes taken off the running site on 2026-08-20.
 */

const COPART = "https://cs.copart.com/v1/AUTH_svc.pdoc00001/lpp/0526/8bbbf5be_hrs.jpg";
const IAAI = "https://vis.iaai.com/resizer?imageKeys=46366496~SID~B609&width=845&height=633";

describe("photoUrlForSize — Copart", () => {
  it("swaps the variant suffix for the size being drawn", () => {
    expect(photoUrlForSize(COPART, "thumb")).toContain("8bbbf5be_thb.jpg");
    expect(photoUrlForSize(COPART, "card")).toContain("8bbbf5be_ful.jpg");
    expect(photoUrlForSize(COPART, "full")).toContain("8bbbf5be_hrs.jpg");
  });

  it("converts between variants in either direction", () => {
    // The mirror stores whichever the sweep happened to see; both are real.
    const fromFul = COPART.replace("_hrs", "_ful");
    expect(photoUrlForSize(fromFul, "thumb")).toContain("_thb.jpg");
    expect(photoUrlForSize(COPART, "thumb")).toContain("_thb.jpg");
  });

  it("changes nothing but the suffix", () => {
    const out = new URL(photoUrlForSize(COPART, "thumb"));
    const src = new URL(COPART);
    expect(out.hostname).toBe(src.hostname);
    expect(out.pathname.replace("_thb", "_hrs")).toBe(src.pathname);
  });

  it("leaves a Copart URL with no known variant alone", () => {
    // ⚠️ If we appended a suffix to whatever we were given, this would become a
    // 404. Untouched means it renders exactly as it does today.
    const odd = "https://cs.copart.com/v1/AUTH_svc.pdoc00001/lpp/0526/8bbbf5be.jpg";
    expect(photoUrlForSize(odd, "thumb")).toBe(odd);
  });

  it("only matches the suffix at the end of the path", () => {
    // A directory that happens to be called `_ful.jpg` must not be rewritten.
    const tricky = "https://cs.copart.com/v1/_ful.jpg/0526/photo.png";
    expect(photoUrlForSize(tricky, "thumb")).toBe(tricky);
  });
});

describe("photoUrlForSize — IAAI", () => {
  it("asks the resizer for fewer pixels, keeping the aspect ratio", () => {
    const thumb = new URL(photoUrlForSize(IAAI, "thumb"));
    expect(thumb.searchParams.get("width")).toBe("200");
    expect(thumb.searchParams.get("height")).toBe("150");
    // The key that identifies the photograph must survive untouched.
    expect(thumb.searchParams.get("imageKeys")).toBe("46366496~SID~B609");
  });

  it("leaves the card size at the width the vendor already emits", () => {
    const card = new URL(photoUrlForSize(IAAI, "card"));
    expect(card.searchParams.get("width")).toBe("845");
  });

  it("ignores an IAAI URL that is not the resizer", () => {
    // `vis.iaai.com` also serves plain files; width/height mean nothing there.
    const plain = "https://vis.iaai.com/photos/46366496.jpg";
    expect(photoUrlForSize(plain, "thumb")).toBe(plain);
  });
});

describe("photoUrlForSize — anything else", () => {
  it("returns unknown hosts unchanged", () => {
    const other = "https://example.com/car_hrs.jpg";
    expect(photoUrlForSize(other, "thumb")).toBe(other);
  });

  it("survives a string that is not a URL at all", () => {
    // 13 rows in the mirror hold a source_url with no scheme — see imageProxy.
    expect(photoUrlForSize("cs.copart.com/x_hrs.jpg", "thumb")).toBe("cs.copart.com/x_hrs.jpg");
    expect(photoUrlForSize("", "card")).toBe("");
  });
});
