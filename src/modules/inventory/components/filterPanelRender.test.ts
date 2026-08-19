import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

/**
 * Does the panel actually render, and does it render the right thing?
 *
 * The pure URL logic is covered in `model/filterQuery.test.ts`. This covers the
 * part that file cannot: that the component survives real facet data and puts
 * the counts, the labels and the toggle links where they belong. A crash here
 * takes the whole search page down, and it is the one thing about this feature
 * that could not be checked in a browser — Next 16 refuses a second `next dev`
 * in one directory and another session's server holds it.
 *
 * `renderToStaticMarkup` rather than a DOM: this stays inside the `node`
 * environment vitest is deliberately configured with, so the suite gains
 * coverage without gaining a browser and the run stays fast.
 *
 * The i18n Link is mocked to a plain anchor. It is Next's router binding, not
 * behaviour of ours, and importing it for real is what made the first attempt at
 * a test impossible.
 */
vi.mock("@/i18n/navigation", () => ({
  Link: ({
    href,
    children,
  }: {
    href: { pathname: string; query: Record<string, string> };
    children: React.ReactNode;
  }) =>
    createElement(
      "a",
      { href: `${href.pathname}?${new URLSearchParams(href.query).toString()}` },
      children
    ),
}));

const { default: FilterPanel, countActiveFilters } = await import("./FilterPanel");

/** The shipped English messages, read as the search page reads them. */
const enMessages = (await import("../../../../messages/en.json")).default;

/** Shaped like a real `getFacets` result, with counts measured off the mirror. */
const FACETS = {
  vehicle_class: [
    { value: "automobile", count: 107859 },
    { value: "truck", count: 4398 },
    { value: "motorcycle", count: 1686 },
  ],
  title: [
    { value: "salvage", count: 60615 },
    { value: "clean", count: 43636 },
    { value: "rebuildable", count: 2630 },
  ],
  fuel: [
    { value: "gasoline", count: 93854 },
    { value: "diesel", count: 3770 },
  ],
  // Nine options, so the tail must fold into a disclosure.
  color: Array.from({ length: 9 }, (_, i) => ({ value: `c${i}`, count: 100 - i })),
  // Numerals, which carry no vocabulary and must fall back to the raw value.
  cylinders: [{ value: "4", count: 60129 }],
};

const LABELS = {
  heading: "Filters",
  reset: "Clear",
  showMore: "Show {count} more",
  groups: { vehicle_class: "Category", title: "Document", fuel: "Fuel", color: "Colour", cylinders: "Cylinders" },
  // Nested, because next-intl refuses a message key containing a dot. These
  // fixtures were flat once, matched the component, and both were wrong
  // together — which is exactly why the test below reads the real file instead.
  options: {
    vehicle_class: { automobile: "Cars" },
    title: { salvage: "Salvage", rebuildable: "Rebuildable" },
    fuel: { gasoline: "Petrol", diesel: "Diesel" },
  },
};

function render(query: Record<string, string> = {}) {
  return renderToStaticMarkup(
    createElement(FilterPanel, { facets: FACETS, query, labels: LABELS })
  );
}

describe("FilterPanel rendering", () => {
  it("renders without throwing on real facet data", () => {
    expect(() => render()).not.toThrow();
  });

  it("shows the count beside every option — the thing the competitor cannot do", () => {
    const html = render();
    expect(html).toContain("107,859");
    expect(html).toContain("60,615");
    expect(html).toContain("93,854");
  });

  it("uses the translated label, not the raw class value", () => {
    const html = render();
    expect(html).toContain("Petrol");
    expect(html).not.toContain(">gasoline<");
  });

  it("falls back to the raw value where a dimension has no vocabulary", () => {
    // Cylinder counts are numerals and are deliberately untranslated.
    expect(render()).toContain("60,129");
  });

  it("reads the real en.json labels, in the shape next-intl can deliver", () => {
    // THE REGRESSION THIS EXISTS FOR: the options were flat "fuel.gasoline"
    // keys, the component looked them up the same way, and these tests passed
    // — while next-intl threw INVALID_KEY and killed `next dev`, because it
    // reads "." as nesting. Fixtures agreeing with the component proved
    // nothing; only the real file can. `check:locales` guards the same rule
    // from the other side.
    const labels = { ...LABELS, options: enMessages.Search.filters.options };
    const html = renderToStaticMarkup(
      createElement(FilterPanel, { facets: FACETS, query: {}, labels })
    );
    expect(html).toContain("Salvage");
    expect(html).toContain("Rebuildable");
    expect(html).not.toContain(">salvage<");
  });

  it("keeps Rebuildable visible as its own option", () => {
    // Six buckets to the competitor's four, and this is the one that matters:
    // it changes what a client may legally do with the car after import.
    expect(render()).toContain("Rebuildable");
  });

  it("links each option to itself toggled on", () => {
    expect(render()).toContain("/search?title=salvage");
  });

  it("links an already-selected option to itself toggled off", () => {
    const html = render({ title: "salvage" });
    // Selecting the only active value must produce a link with no title param
    // at all, or the filter could never be cleared.
    expect(html).toContain('href="/search?"');
  });

  it("carries the other filters through every link", () => {
    const html = render({ q: "ford", fuel: "diesel" });
    expect(html).toContain("q=ford");
    expect(html).toContain("fuel=diesel");
  });

  it("offers a reset only when something is selected", () => {
    expect(render()).not.toContain("Clear");
    expect(render({ title: "salvage" })).toContain("Clear");
  });

  it("folds a long list into a disclosure rather than printing 17 colours", () => {
    const html = render();
    expect(html).toContain("<details");
    expect(html).toContain("Show 3 more");
  });

  it("omits a dimension the result set cannot offer", () => {
    // Browsing motorcycles must not show a Body Type list — which is exactly
    // what the competitor does, offering "Sedan / SUV / Pickup" for bikes.
    const html = renderToStaticMarkup(
      createElement(FilterPanel, {
        facets: { ...FACETS, body_type: [] },
        query: {},
        labels: { ...LABELS, groups: { ...LABELS.groups, body_type: "Body type" } },
      })
    );
    expect(html).not.toContain("Body type");
  });

  it("survives a dimension the labels do not cover", () => {
    // A new vendor value must degrade to its raw name, never crash the page.
    const html = renderToStaticMarkup(
      createElement(FilterPanel, {
        facets: { fuel: [{ value: "hydrogen", count: 3 }] },
        query: {},
        labels: LABELS,
      })
    );
    expect(html).toContain("hydrogen");
  });
});

/**
 * The badge on the mobile disclosure button.
 *
 * It is what makes collapsing the panel by default safe: closed, the panel
 * would otherwise hide that anything is filtering at all, and "why are there
 * only 40 results" becomes unanswerable without opening it. A wrong number is
 * worse than none, so the counting rule is pinned here rather than left to
 * whoever next edits DIMENSIONS.
 */
describe("countActiveFilters", () => {
  it("counts nothing on an unfiltered search", () => {
    expect(countActiveFilters({})).toBe(0);
    // `q` and `category` are where the visitor browsed to, not what they
    // narrowed by — and neither is set from inside the panel.
    expect(countActiveFilters({ q: "bmw", category: "automobile" })).toBe(0);
  });

  it("counts the make and the model, which the panel now owns", () => {
    // They used to be set only by the widget above the results, where the badge
    // on a collapsed panel had no business claiming them. They are pickers
    // inside the panel now, so a phone showing "Filters" with nothing beside it
    // while a BMW filter is on would be lying about its own contents.
    expect(countActiveFilters({ make: "BMW" })).toBe(1);
    // Two choices, two counts: they are removed separately from the chips.
    expect(countActiveFilters({ make: "BMW", model: "3 Series" })).toBe(2);
    expect(countActiveFilters({ make: "BMW", model: "3 Series", color: "red" })).toBe(3);
  });

  it("counts values rather than dimensions", () => {
    // Two classes and a colour is three filters to a shopper, not two
    // dimensions — the badge has to agree with what they think they ticked.
    expect(
      countActiveFilters({ vehicle_class: "truck,motorcycle", color: "red" })
    ).toBe(3);
  });

  it("counts a mileage range, because the panel owns it", () => {
    // Mileage moved out of the search widget and into the panel — as fixed
    // bands at first and as a typed range since — so the badge has to admit to
    // it. A collapsed panel hiding a mileage filter is the exact confusion the
    // badge exists to prevent.
    expect(countActiveFilters({ odoMin: "50000", odoMax: "100000" })).toBe(1);
    // One, not two: min and max are a single choice to whoever made it.
    expect(countActiveFilters({ odoMax: "50000" })).toBe(1);
  });

  it("counts a year range, and counts it once", () => {
    expect(countActiveFilters({ yearFrom: "2015", yearTo: "2020" })).toBe(1);
    expect(countActiveFilters({ yearFrom: "2015" })).toBe(1);
    // Year and mileage are two separate choices, so two.
    expect(countActiveFilters({ yearFrom: "2015", odoMax: "100000" })).toBe(2);
  });

  it("still ignores ranges no control can set", () => {
    // Engine size and retail value were removed from the UI entirely. A
    // hand-typed URL can still apply them, and they are deliberately not
    // counted: opening the panel would not show them, so a badge promising
    // otherwise would send the visitor looking for a control that is gone.
    expect(countActiveFilters({ retailMax: "20000", engineFrom: "2000" })).toBe(0);
  });

  it("is not fooled by an empty or ragged param", () => {
    // These arrive from hand-edited URLs. A trailing comma must not read as
    // one more filter than the panel shows ticked.
    expect(countActiveFilters({ color: "" })).toBe(0);
    expect(countActiveFilters({ color: "red,," })).toBe(1);
    expect(countActiveFilters({ color: " red , blue " })).toBe(2);
  });
});
