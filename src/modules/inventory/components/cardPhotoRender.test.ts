import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import CardPhoto from "./CardPhoto";

/**
 * The img moved out of LotCard into a client component so a dead photograph
 * can collapse into the "no photo" state. What this static render protects is
 * the move itself: the lazy-loading and intrinsic-size work of 2026-08-20
 * travelled here as ATTRIBUTES, and losing one in the move would quietly
 * re-fetch every below-fold photograph again. The error→fallback swap is
 * client state, which this node-environment suite deliberately cannot drive —
 * it is three lines, and the attributes are the part with history.
 */
describe("CardPhoto", () => {
  const html = renderToStaticMarkup(
    createElement(CardPhoto, {
      src: "/api/auction-image?u=x",
      alt: "2020 BMW 530I",
      noPhotoLabel: "No photo",
    })
  );

  it("keeps the lazy-loading contract the search page measurement earned", () => {
    expect(html).toContain('loading="lazy"');
    expect(html).toContain('decoding="async"');
  });

  it("keeps the intrinsic size of the card variant", () => {
    expect(html).toContain('width="960"');
    expect(html).toContain('height="720"');
  });

  it("renders the photograph, not the fallback, while nothing has failed", () => {
    expect(html).toContain("<img");
    expect(html).not.toContain("No photo");
  });
});
