import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword, passwordMeetsPolicy, MIN_PASSWORD_LENGTH } from "./password";
import { generateToken, hashToken } from "./token";

describe("password hashing", () => {
  it("verifies the password it hashed", async () => {
    const hash = await hashPassword("correct horse battery staple");
    expect(await verifyPassword("correct horse battery staple", hash)).toBe(true);
  });

  it("rejects a wrong password", async () => {
    const hash = await hashPassword("correct horse battery staple");
    expect(await verifyPassword("correct horse battery stable", hash)).toBe(false);
  });

  it("salts: same password twice gives different hashes, both valid", async () => {
    const a = await hashPassword("same password");
    const b = await hashPassword("same password");
    expect(a).not.toBe(b);
    expect(await verifyPassword("same password", a)).toBe(true);
    expect(await verifyPassword("same password", b)).toBe(true);
  });

  it("stored format is self-describing with the intended work factors", async () => {
    const hash = await hashPassword("x".repeat(12));
    const [alg, n, r, p] = hash.split("$");
    expect(alg).toBe("scrypt");
    expect(Number(n)).toBe(131072);
    expect(Number(r)).toBe(8);
    expect(Number(p)).toBe(1);
  });

  it("rejects malformed stored values instead of throwing", async () => {
    expect(await verifyPassword("anything", "")).toBe(false);
    expect(await verifyPassword("anything", "bcrypt$whatever")).toBe(false);
    expect(await verifyPassword("anything", "scrypt$notanumber$8$1$AA$AA")).toBe(false);
  });

  it("handles unicode passwords", async () => {
    const pw = "pärolė-Пароль-🔑-ilgas";
    expect(await verifyPassword(pw, await hashPassword(pw))).toBe(true);
  });
});

describe("password policy", () => {
  it("is a pure length rule (NIST: no composition requirements)", () => {
    expect(passwordMeetsPolicy("a".repeat(MIN_PASSWORD_LENGTH - 1))).toBe(false);
    expect(passwordMeetsPolicy("a".repeat(MIN_PASSWORD_LENGTH))).toBe(true);
    expect(passwordMeetsPolicy("a".repeat(201))).toBe(false);
  });
});

describe("opaque tokens", () => {
  it("generates unique url-safe tokens", () => {
    const seen = new Set(Array.from({ length: 100 }, () => generateToken()));
    expect(seen.size).toBe(100);
    for (const t of seen) expect(t).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("hashes deterministically and irreversibly-shaped", () => {
    const t = generateToken();
    expect(hashToken(t)).toBe(hashToken(t));
    expect(hashToken(t)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken(t)).not.toContain(t);
  });
});
