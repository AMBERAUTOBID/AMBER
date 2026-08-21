import { describe, expect, it } from "vitest";
import { parseGalleryPayload } from "./apicarsGallery";

/** The live shape from lot 59538786, 2026-08-21: the lot sits inside an
 * ARRAY — `{"result":[{...}]}`. The first parser assumed an object and
 * silently returned null on every real response; only the raw-dump check
 * caught it. This fixture is the dump, not a guess. */
const LOT = {
  car_photo: {
    photo: [
      "https://cs.copart.com/v1/AUTH_x/lpp/0726/a_hrs.jpg",
      "https://cs.copart.com/v1/AUTH_x/lpp/0726/b_hrs.jpg",
    ],
  },
};
const LIVE = { result: [LOT], api_request_left: -41421 };

describe("parseGalleryPayload", () => {
  it("reads the gallery from the measured live shape — result is an ARRAY", () => {
    expect(parseGalleryPayload(LIVE)).toHaveLength(2);
  });

  it("tolerates the bare-object and result.data nestings other endpoints use", () => {
    expect(parseGalleryPayload({ result: LOT })).toHaveLength(2);
    expect(parseGalleryPayload({ result: { data: [LOT] } })).toHaveLength(2);
  });

  it("drops entries that are not https URLs rather than passing junk to the page", () => {
    const out = parseGalleryPayload({
      result: [{ car_photo: { photo: ["https://cs.copart.com/x.jpg", null, 42, "ftp://x"] } }],
    });
    expect(out).toEqual(["https://cs.copart.com/x.jpg"]);
  });

  it("answers null for an empty gallery, an absent field, or garbage", () => {
    expect(parseGalleryPayload({ result: [{ car_photo: { photo: [] } }] })).toBeNull();
    expect(parseGalleryPayload({ result: {} })).toBeNull();
    expect(parseGalleryPayload(null)).toBeNull();
    expect(parseGalleryPayload("oops")).toBeNull();
  });
});
