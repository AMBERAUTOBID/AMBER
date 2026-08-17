import { describe, expect, it } from "vitest";
import { depositReference } from "./depositReference";

describe("depositReference", () => {
  it("is short enough to copy into a bank form by eye", () => {
    expect(depositReference("a845a0ae-0075-4bf0-aaec-974aaa93779d")).toBe("DEP-A845A0AE");
  });

  it("is the same every time, because it is derived and never stored", () => {
    const id = "3f2a9c41-1111-4111-8111-111111111111";
    expect(depositReference(id)).toBe(depositReference(id));
  });

  it("separates two open requests from the same client", () => {
    // An upgrade opens a second deposit while the first is still pending, and
    // the two are different amounts. A reference naming the person rather than
    // the request could not tell them apart.
    const first = depositReference("11111111-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    const second = depositReference("22222222-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    expect(first).not.toBe(second);
  });

  it("upper-cases, so a reference read aloud and one typed back match", () => {
    expect(depositReference("abcdef01-0000-4000-8000-000000000000")).toBe("DEP-ABCDEF01");
  });
});
