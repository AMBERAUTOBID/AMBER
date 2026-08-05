/**
 * The open-redirect guard on `/login?next=…`.
 *
 * Worth testing carefully because the failure is quiet and expensive: a
 * permitted off-site destination lets an attacker send `/login?next=<their
 * fake login page>` from our real domain, wait for the victim to sign in
 * legitimately, then collect the password they type into the copy they land
 * on. Nothing looks wrong to the user at any point.
 *
 * Every rejection below is a real bypass technique, not a hypothetical.
 */
import { describe, expect, it } from "vitest";
import { safeReturnPath } from "./safeReturnPath";

describe("accepts paths on this site", () => {
  for (const path of [
    "/account",
    "/account/plan",
    "/lt/account/details",
    "/vehicle/1HGCM82633A004352",
    "/search?make=BMW&model=X5",
    "/plans#bronze",
  ]) {
    it(path, () => expect(safeReturnPath(path)).toBe(path));
  }
});

describe("rejects anything that could leave the site", () => {
  const attacks: Record<string, string> = {
    "absolute http URL": "http://evil.example/login",
    "absolute https URL": "https://evil.example/login",
    "protocol-relative": "//evil.example/login",
    "protocol-relative, no path": "//evil.example",
    "backslash instead of slash": "/\\evil.example",
    "double backslash": "\\\\evil.example",
    "backslash anywhere": "/account\\@evil.example",
    "javascript scheme": "javascript:alert(1)",
    "javascript scheme, leading slash": "/javascript:alert(1)",
    "data scheme": "data:text/html,<script>alert(1)</script>",
    "scheme with leading whitespace": "/ javascript:alert(1)",
    "relative path": "account/plan",
    empty: "",
    "bare hash": "#",
  };

  for (const [name, value] of Object.entries(attacks)) {
    it(name, () => expect(safeReturnPath(value)).toBeNull());
  }

  it("rejects absurdly long values rather than passing them on", () => {
    expect(safeReturnPath("/" + "a".repeat(600))).toBeNull();
  });
});

/**
 * Built from char codes rather than escape sequences so the bytes under test
 * are unambiguous in the source — a literal CR in a test file is invisible
 * and the first thing an editor silently rewrites.
 */
describe("rejects control characters, which parsers disagree about", () => {
  const named: Record<string, number> = {
    NUL: 0x00,
    TAB: 0x09,
    LF: 0x0a,
    CR: 0x0d,
    "unit separator": 0x1f,
    DEL: 0x7f,
  };

  for (const [name, code] of Object.entries(named)) {
    it(name, () => {
      expect(safeReturnPath("/account" + String.fromCharCode(code))).toBeNull();
    });
  }

  it("a CRLF header-splitting attempt", () => {
    const crlf = String.fromCharCode(0x0d, 0x0a);
    expect(safeReturnPath(`/account${crlf}Set-Cookie: session=stolen`)).toBeNull();
  });
});

describe("rejects non-strings without throwing", () => {
  for (const value of [null, undefined]) {
    it(String(value), () => expect(safeReturnPath(value)).toBeNull());
  }

  it("an array, as a repeated ?next= query param produces", () => {
    // Next gives `string | string[]` for repeated params. Passing the array
    // straight through must not crash the login page.
    expect(safeReturnPath(["/account", "https://evil.example"] as unknown as string)).toBeNull();
  });
});
