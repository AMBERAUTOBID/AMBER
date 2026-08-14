/**
 * The keys that decide what counts as "the same thing again".
 *
 * This is the whole difference between a history an admin reads and a wall
 * they stop opening. Too specific and nothing ever collapses — a client
 * walking three pages of one search becomes three interests. Too loose and
 * genuinely different interests merge into one line, which is worse, because
 * it is silent.
 */
import { describe, expect, it } from "vitest";
import { lotLabel, lotSubjectKey, searchLabel, searchSubjectKey } from "./subjects";

describe("lot keys identify a car, not a spelling of it", () => {
  it("case and padding never make two cars out of one", () => {
    expect(lotSubjectKey("COPART", " 12345 ")).toBe(lotSubjectKey("copart", "12345"));
  });

  it("the same lot number on the two platforms stays two cars", () => {
    expect(lotSubjectKey("copart", "12345")).not.toBe(lotSubjectKey("iaai", "12345"));
  });
});

describe("lot labels never state a price nobody offered", () => {
  it("prints the bid when there is one", () => {
    expect(lotLabel("2019 BMW X5", 1240000)).toBe("2019 BMW X5 — $12,400");
  });

  it("omits it entirely when there is none", () => {
    // Copart lots routinely carry no bid before bidding opens. "$0" in a
    // history is an offer nobody made — the same invariant the plan cards and
    // the favourites snapshot follow.
    expect(lotLabel("2019 BMW X5", null)).toBe("2019 BMW X5");
    expect(lotLabel("2019 BMW X5", undefined)).toBe("2019 BMW X5");
    expect(lotLabel("2019 BMW X5", 0)).toBe("2019 BMW X5");
  });

  it("never renders an empty name", () => {
    expect(lotLabel("   ", null)).toBe("Unknown lot");
  });
});

describe("search keys collapse the same search written differently", () => {
  it("parameter order does not matter", () => {
    expect(searchSubjectKey({ make: "BMW", model: "X5" })).toBe(
      searchSubjectKey({ model: "x5", make: "bmw" })
    );
  });

  it("paging is not a new interest", () => {
    // THE REGRESSION THIS EXISTS FOR: without dropping `page`, a client
    // scrolling through four pages of one search produces four lines, and the
    // history reads as somebody searching frantically rather than reading
    // results.
    expect(searchSubjectKey({ make: "bmw", page: "3" })).toBe(searchSubjectKey({ make: "bmw" }));
    expect(searchSubjectKey({ make: "bmw", sort: "price" })).toBe(
      searchSubjectKey({ make: "bmw" })
    );
  });

  it("the site gate key never reaches the history", () => {
    // `?key=` is the pre-launch bypass. It is a shared secret, and a history
    // that recorded it would be a log file containing the password to the site.
    expect(searchSubjectKey({ make: "bmw", key: "s3cret" })).toBe(
      searchSubjectKey({ make: "bmw" })
    );
    expect(searchSubjectKey({ key: "s3cret" })).toBe("");
  });

  it("empty values do not pad the key", () => {
    expect(searchSubjectKey({ make: "bmw", model: "", q: undefined })).toBe(
      searchSubjectKey({ make: "bmw" })
    );
  });

  it("genuinely different searches stay different", () => {
    expect(searchSubjectKey({ make: "bmw" })).not.toBe(searchSubjectKey({ make: "audi" }));
    expect(searchSubjectKey({ make: "bmw" })).not.toBe(
      searchSubjectKey({ make: "bmw", yearFrom: "2018" })
    );
  });

  it("array values collapse to one deterministic key", () => {
    expect(searchSubjectKey({ type: ["suv", "truck"] })).toBe(
      searchSubjectKey({ type: ["suv", "truck"] })
    );
  });
});

describe("search labels always say something", () => {
  it("free text is quoted", () => {
    expect(searchLabel({ q: "tundra" })).toBe("“tundra”");
  });

  it("filters describe themselves when there is no free text", () => {
    expect(searchLabel({ make: "BMW", model: "X5" })).toBe("BMW X5");
  });

  it("both together", () => {
    expect(searchLabel({ q: "clean title", make: "BMW" })).toBe("“clean title” · BMW");
  });

  it("a bare search is named rather than left blank", () => {
    // An empty label would render as a line with a date and nothing else,
    // which reads as a broken row rather than as browsing everything.
    expect(searchLabel({})).toBe("All vehicles");
    expect(searchLabel({ page: "2" })).toBe("All vehicles");
  });
});
