import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

/**
 * What the chips above the results actually say, and what each one removes.
 *
 * WHY THIS FILE EXISTS AT ALL: every existing assertion about these chips was
 * about WHICH params they cover, and a chip can be perfectly correct about that
 * while reading as nonsense. The year chip rendered "≥ 2,015" for months — right
 * param, right link, and a number no reader has ever seen written that way. It
 * was found by opening the page, not by the suite, which is exactly the kind of
 * gap worth closing once it is known.
 *
 * `renderToStaticMarkup` in the `node` environment vitest is configured with, so
 * the suite gains coverage without gaining a browser. The i18n Link and the icon
 * set are mocked — they are Next's router binding and a font, not behaviour of
 * ours, and importing either for real is what made an earlier attempt at a
 * component test impossible.
 */
vi.mock("@/i18n/navigation", () => ({
  Link: ({
    href,
    children,
  }: {
    href: string | { pathname: string; query: Record<string, string> };
    children: React.ReactNode;
  }) =>
    createElement(
      "a",
      {
        href:
          typeof href === "string"
            ? href
            : `${href.pathname}?${new URLSearchParams(href.query).toString()}`,
      },
      children
    ),
  useRouter: () => ({ push: () => {} }),
}));

vi.mock("@phosphor-icons/react/dist/ssr", () => ({
  X: () => null,
  ArrowCounterClockwise: () => null,
}));

const { default: ActiveFilters } = await import("./ActiveFilters");

const LABELS = {
  heading: "Filters",
  reset: "Clear",
  showMore: "Show {count} more",
  groups: { make: "Make", model: "Model", color: "Colour" },
  options: { color: { blue: "Blue" } },
  ranges: { year: "Year", odometer: "Odometer" },
  vehicleTypes: { automobile: "Cars" },
  buyNow: "Buy now",
  searchTerm: "Search",
  clearAll: "Clear all",
  browseType: "Browsing",
};

function render(query: Record<string, string>) {
  return renderToStaticMarkup(createElement(ActiveFilters, { query, labels: LABELS }));
}

describe("ActiveFilters — what the chips say", () => {
  it("writes a year as a year, not as a quantity", () => {
    // The regression: `toLocaleString` grouped it into "2,015".
    expect(render({ yearFrom: "2015" })).toContain("≥ 2015");
    expect(render({ yearFrom: "2015" })).not.toContain("2,015");
    expect(render({ yearTo: "2020" })).toContain("≤ 2020");
    expect(render({ yearFrom: "2015", yearTo: "2020" })).toContain("2015 – 2020");
  });

  it("still groups mileage, which IS a quantity", () => {
    // The same code path, and the opposite answer — which is why the two are
    // asserted together rather than the year being special-cased quietly.
    expect(render({ odoMin: "50000", odoMax: "150000" })).toContain("50,000 – 150,000 mi");
  });

  it("shows make and model as two chips that come off separately", () => {
    const html = render({ make: "BMW", model: "3 Series" });
    expect(html).toContain("BMW");
    expect(html).toContain("3 Series");
    // Removing the model keeps the make.
    expect(html).toContain("make=BMW");
    // ⚠️ And removing the make takes the model with it: a model without its
    // make sends the server to `model ILIKE %3 Series%` across every marque.
    const links = [...html.matchAll(/href="\/search\?([^"]*)"/g)].map((m) => m[1]);
    const makeChipLink = links.find((l) => !l.includes("make") && !l.includes("model"));
    expect(makeChipLink).toBeDefined();
  });

  it("says nothing when nothing is filtered", () => {
    expect(render({})).toBe("");
  });
});
