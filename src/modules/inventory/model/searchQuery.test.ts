import { describe, expect, it } from "vitest";
import {
  parseFreeTextQuery,
  shouldRescueMisspelling,
  MISSPELLING_RESCUE_BELOW,
} from "./searchQuery";

/**
 * Every case here maps to a filter Apibara actually receives, so a wrong answer
 * is a page of wrong cars — or, more often, a confident "no vehicles found" on
 * a query that had real matches.
 *
 * The three `make`/`model` rules being defended:
 *   1. Matching is on whole tokens. Substring matching made "Mercedes" resolve
 *      to the Lexus "ES" (merced-ES) and "under 5000" to the Fiat "500".
 *   2. The make is resolved before the model, so a query naming both can never
 *      have the model pick the brand ("Mercedes C300" -> Chrysler's "300").
 *   3. Punctuation is stripped before comparing, so the hyphens in
 *      "Mercedes-Benz" and "Harley-Davidson" don't have to be typed.
 */
describe("parseFreeTextQuery", () => {
  it("resolves a plain make and model", () => {
    expect(parseFreeTextQuery("Honda Civic")).toEqual({ make: "Honda", model: "Civic" });
    expect(parseFreeTextQuery("Ford Mustang")).toEqual({ make: "Ford", model: "Mustang" });
  });

  it("matches whole tokens, never substrings", () => {
    // "merced-ES" used to hit the Lexus ES; "mini-van" used to hit the make Mini.
    expect(parseFreeTextQuery("Mercedes")).toEqual({ make: "Mercedes-Benz" });
    expect(parseFreeTextQuery("minivan")).toEqual({ type: "VAN" });
  });

  it("lets the stated make win over a model that also matches", () => {
    // C300 contains "300", which is a real Chrysler model.
    expect(parseFreeTextQuery("Mercedes C300")).toEqual({
      make: "Mercedes-Benz",
      model: "C300",
    });
  });

  it("accepts hyphenated makes typed without the hyphen", () => {
    expect(parseFreeTextQuery("Mercedes Benz")).toEqual({ make: "Mercedes-Benz" });
    expect(parseFreeTextQuery("Rolls Royce Ghost")).toEqual({
      make: "Rolls-Royce",
      model: "Ghost",
    });
    expect(parseFreeTextQuery("Harley Davidson Sportster")).toEqual({
      make: "Harley-Davidson",
      model: "Sportster",
    });
  });

  it("understands brand nicknames", () => {
    expect(parseFreeTextQuery("VW Golf")).toEqual({ make: "Volkswagen", model: "Golf" });
    expect(parseFreeTextQuery("Chevy Camaro")).toEqual({ make: "Chevrolet", model: "Camaro" });
    expect(parseFreeTextQuery("Alfa Giulia")).toEqual({ make: "Alfa Romeo", model: "Giulia" });
  });

  it("matches a model typed as one word", () => {
    // "CR-V" tokenises to ["cr","v"], which no single typed word can equal.
    expect(parseFreeTextQuery("Honda CRV")).toEqual({ make: "Honda", model: "CR-V" });
  });

  it("prefers the longest model, so a sub-model isn't truncated", () => {
    expect(parseFreeTextQuery("Range Rover Sport")).toEqual({
      make: "Land Rover",
      model: "Range Rover Sport",
    });
    expect(parseFreeTextQuery("Range Rover")).toEqual({
      make: "Land Rover",
      model: "Range Rover",
    });
  });

  it("pulls a year out of the text instead of dropping it", () => {
    expect(parseFreeTextQuery("2015 Honda Civic")).toEqual({
      make: "Honda",
      model: "Civic",
      yearFrom: 2015,
      yearTo: 2015,
    });
    expect(parseFreeTextQuery("Honda Civic 2015")).toEqual({
      make: "Honda",
      model: "Civic",
      yearFrom: 2015,
      yearTo: 2015,
    });
  });

  it("does not mistake a numeric model for a year", () => {
    // 1500 is outside the plausible year range; 2500HD keeps letters in the
    // same token so it never looks like four bare digits.
    expect(parseFreeTextQuery("Ram 1500")).toEqual({ make: "Ram", model: "1500" });
    expect(parseFreeTextQuery("Chevrolet Silverado 2500HD")).toEqual({
      make: "Chevrolet",
      model: "Silverado 2500HD",
    });
  });

  it("maps body-style words to a type when no model is named", () => {
    expect(parseFreeTextQuery("pickup truck")).toEqual({ type: "PICKUP" });
    expect(parseFreeTextQuery("dirt bike")).toEqual({ type: "DIRT BIKE" });
    expect(parseFreeTextQuery("Honda SUV")).toEqual({ make: "Honda", type: "SUV" });
  });

  it("treats the 'More' equipment words as types, not makes", () => {
    // MAKES_BY_CATEGORY.more holds equipment types; flattening it into the make
    // list produced make="Jet Ski", which Apibara's make param cannot match.
    expect(parseFreeTextQuery("jet ski")).toEqual({ type: "JET SKI" });
    expect(parseFreeTextQuery("boat")).toEqual({ type: "BOAT" });
    expect(parseFreeTextQuery("trailer")).toEqual({ type: "TRAILERS" });
  });

  it("never combines a type with a model", () => {
    // Apibara may classify a ProMaster as TRUCK rather than VAN; sending both
    // would AND them into an empty result.
    const parsed = parseFreeTextQuery("Ram ProMaster van");
    expect(parsed.model).toBe("ProMaster");
    expect(parsed.type).toBeUndefined();
  });

  it("sends identifiers to the strict keyword param", () => {
    expect(parseFreeTextQuery("1FTZR15V3XTA88607")).toEqual({ s: "1FTZR15V3XTA88607" });
    expect(parseFreeTextQuery("60453786")).toEqual({ s: "60453786" });
  });

  it("strips shopping filler rather than searching for it", () => {
    // A bare budget number can't be honoured (no price filter is wired up), so
    // the query degrades to an unfiltered browse instead of a guaranteed miss.
    expect(parseFreeTextQuery("cheap car under 5000")).toEqual({});
    expect(parseFreeTextQuery("looking for a cheap Honda")).toEqual({ make: "Honda" });
  });

  it("keeps unrecognised text as a keyword search", () => {
    expect(parseFreeTextQuery("asdfghjkl")).toEqual({ s: "asdfghjkl" });
  });

  it("returns nothing for empty input", () => {
    expect(parseFreeTextQuery("")).toEqual({});
    expect(parseFreeTextQuery("   ")).toEqual({});
    expect(parseFreeTextQuery("!!!")).toEqual({});
  });
});

describe("shouldRescueMisspelling", () => {
  /**
   * The bug this rule exists for. The auction's own data lists lot 59193196
   * with make `VOLKSWAGON`, so the misspelling matched exactly one car — and
   * because the old trigger was "exactly zero results", typo rescue never ran.
   * The visitor saw 1 car where 2,789 were available, on a page that gave every
   * appearance of having worked.
   */
  it("rescues a misspelling that the vendor's own data also contains", () => {
    expect(shouldRescueMisspelling("volkswagon", 1)).toBe(true);
  });

  it("still rescues the empty case the old rule caught", () => {
    expect(shouldRescueMisspelling("mercedez", 0)).toBe(true);
    expect(shouldRescueMisspelling("porshe", 0)).toBe(true);
  });

  it("leaves a real make alone", () => {
    // Every marque anyone actually searches returns thousands.
    expect(shouldRescueMisspelling("volkswagen", 2789)).toBe(false);
    expect(shouldRescueMisspelling("toyota", 16185)).toBe(false);
  });

  /**
   * THE PROPERTY THAT KEEPS A PRECISE QUERY PRECISE. A VIN or a lot number
   * matching one row must stay one row — widening it would answer a question
   * nobody asked. Both carry digits, so the letters-only test excludes them
   * without needing to know anything about their formats.
   */
  it("never touches a VIN, a lot number or a year", () => {
    expect(shouldRescueMisspelling("3VW7M7BU9NM019630", 1)).toBe(false);
    expect(shouldRescueMisspelling("59193196", 1)).toBe(false);
    expect(shouldRescueMisspelling("2015", 3)).toBe(false);
    expect(shouldRescueMisspelling("f150", 2)).toBe(false);
  });

  it("ignores multi-word queries, which the fallback cannot help", () => {
    // It scores the whole term against `make`/`model`, so a phrase scores
    // poorly against either and there is nothing to gain for the ~900ms scan.
    expect(shouldRescueMisspelling("ford f150", 0)).toBe(false);
    expect(shouldRescueMisspelling("mercedez benz", 0)).toBe(false);
  });

  it("ignores very short and empty terms", () => {
    expect(shouldRescueMisspelling("bmw", 0)).toBe(false);
    expect(shouldRescueMisspelling("", 0)).toBe(false);
    expect(shouldRescueMisspelling(undefined, 0)).toBe(false);
    expect(shouldRescueMisspelling("   ", 0)).toBe(false);
  });

  it("accepts non-ASCII letters — the site is searched in three languages", () => {
    expect(shouldRescueMisspelling("mersedas", 2)).toBe(true);
    expect(shouldRescueMisspelling("порше", 0)).toBe(true);
  });

  it("uses the measured threshold, not a round number", () => {
    expect(shouldRescueMisspelling("someword", MISSPELLING_RESCUE_BELOW - 1)).toBe(true);
    expect(shouldRescueMisspelling("someword", MISSPELLING_RESCUE_BELOW)).toBe(false);
  });
});
