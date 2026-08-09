import { describe, expect, it } from "vitest";
import { parseSelected, toggleHref } from "./filterQuery";

/**
 * The panel has no client state — every option is a link whose href is computed
 * here — so these two functions ARE the filter interaction. A bug in them is a
 * filter that cannot be switched off, or one that silently drops the visitor's
 * other choices.
 */
describe("parseSelected", () => {
  it("reads a comma-separated multi-select", () => {
    expect([...parseSelected("gasoline,diesel")]).toEqual(["gasoline", "diesel"]);
  });

  it("survives the shapes a hand-edited URL produces", () => {
    expect(parseSelected(undefined).size).toBe(0);
    expect(parseSelected("").size).toBe(0);
    // Trailing comma and stray spaces must not become empty selections, which
    // would send `fuel=gasoline,` back to the server and match nothing.
    expect([...parseSelected("gasoline, ,diesel,")]).toEqual(["gasoline", "diesel"]);
  });
});

describe("toggleHref", () => {
  it("adds a value that was not selected", () => {
    const { query } = toggleHref({ q: "ford" }, "fuel", "diesel");
    expect(query).toEqual({ q: "ford", fuel: "diesel" });
  });

  it("appends to an existing selection rather than replacing it", () => {
    const { query } = toggleHref({ fuel: "gasoline" }, "fuel", "diesel");
    expect(query.fuel).toBe("gasoline,diesel");
  });

  it("removes a value that was already selected", () => {
    const { query } = toggleHref({ fuel: "gasoline,diesel" }, "fuel", "diesel");
    expect(query.fuel).toBe("gasoline");
  });

  it("drops the param entirely when the last value is unselected", () => {
    // Leaving `fuel=` behind would be an empty filter the server must then
    // decide how to read. Better that it simply is not there.
    const { query } = toggleHref({ q: "ford", fuel: "diesel" }, "fuel", "diesel");
    expect(query).toEqual({ q: "ford" });
    expect("fuel" in query).toBe(false);
  });

  it("keeps every other filter untouched", () => {
    const base = { q: "ford", make: "FORD", title: "clean", yearFrom: "2015", buyNow: "1" };
    const { query } = toggleHref(base, "fuel", "diesel");
    expect(query).toEqual({ ...base, fuel: "diesel" });
  });

  it("always drops the cursor", () => {
    // Page 5 of the old result set is meaningless once the filters change, and
    // carrying it is how a visitor lands on a blank page after narrowing.
    const { query } = toggleHref({ q: "ford", cursor: "NDA=" }, "title", "salvage");
    expect("cursor" in query).toBe(false);
  });

  it("points at the search page", () => {
    expect(toggleHref({}, "fuel", "diesel").pathname).toBe("/search");
  });

  it("round-trips: toggling the same value twice returns the original query", () => {
    const base = { q: "bmw", title: "clean" };
    const once = toggleHref(base, "color", "black");
    const twice = toggleHref(once.query, "color", "black");
    expect(twice.query).toEqual(base);
  });
});
