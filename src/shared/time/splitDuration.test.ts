import { describe, expect, it } from "vitest";
import { splitDuration } from "./splitDuration";

describe("splitDuration", () => {
  it("splits a duration into days, hours, minutes and seconds", () => {
    const ms = ((2 * 24 + 4) * 60 + 12) * 60_000 + 34_000;
    expect(splitDuration(ms)).toEqual({ days: 2, hours: 4, minutes: 12, seconds: 34 });
  });

  it("carries nothing over into a unit that is empty", () => {
    expect(splitDuration(45_000)).toEqual({ days: 0, hours: 0, minutes: 0, seconds: 45 });
  });

  it("clamps a sale that has already run to zero rather than counting backwards", () => {
    expect(splitDuration(-90_000)).toEqual({ days: 0, hours: 0, minutes: 0, seconds: 0 });
    expect(splitDuration(0)).toEqual({ days: 0, hours: 0, minutes: 0, seconds: 0 });
  });

  it("floors rather than rounds, so a countdown never shows time it does not have", () => {
    // 59.9s left is 59 seconds, not a minute.
    expect(splitDuration(59_900)).toEqual({ days: 0, hours: 0, minutes: 0, seconds: 59 });
  });
});
