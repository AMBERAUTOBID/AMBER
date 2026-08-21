import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetTransportForTests, send } from "./transport";

/**
 * nodemailer is stubbed so the suite never opens a socket. Without this the
 * fallback test authenticated against Gmail for real — 680 ms, a dependency on
 * the network, and repeated failed logins against a live account.
 */
const sendMail = vi.fn().mockResolvedValue({ messageId: "test" });
vi.mock("nodemailer", () => ({
  default: { createTransport: () => ({ sendMail: (...args: unknown[]) => sendMail(...args) }) },
}));

/**
 * These tests never open a connection. With no credentials at all `send`
 * returns `logged` before touching nodemailer, which is exactly the branch
 * worth pinning down: it is what runs in local development and what protects
 * a visitor from a 500 caused by a missing environment variable.
 */
const KEYS = [
  "GMAIL_USER",
  "GMAIL_APP_PASSWORD",
  "BILLING_GMAIL_USER",
  "BILLING_GMAIL_APP_PASSWORD",
] as const;

let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
  for (const k of KEYS) delete process.env[k];
  resetTransportForTests();
});

afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  resetTransportForTests();
  sendMail.mockClear();
  vi.restoreAllMocks();
});

const message = { to: "client@example.com", subject: "Sąskaita", text: "..." };

describe("without credentials", () => {
  it("logs instead of sending, for either mailbox", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});

    expect(await send(message)).toEqual({ status: "logged" });
    expect(await send({ ...message, from: "billing" })).toEqual({ status: "logged" });
  });

  it("writes the body to the log, which is how dev reads a token link", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    await send({ ...message, text: "https://smartautobid.com/verify?token=abc" });

    expect(warn.mock.calls[0]?.[0]).toContain("token=abc");
  });
});

describe("the billing mailbox", () => {
  it("falls back to the general login rather than not sending", async () => {
    // An invoice sent from the wrong address is cosmetic. An invoice that
    // never leaves because nobody created an app password yet is a client
    // waiting on a car.
    process.env.GMAIL_USER = "info@smartautobid.com";
    process.env.GMAIL_APP_PASSWORD = "x";
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    await send({ ...message, from: "billing" });

    expect(warn).toHaveBeenCalled();
    expect(warn.mock.calls[0]?.[0]).toContain("BILLING_GMAIL_USER");
    // The header carries the address that actually authenticated, never the
    // one we asked for — Gmail would rewrite it anyway.
    expect(sendMail.mock.calls.at(-1)?.[0].from).toContain("info@smartautobid.com");
  });

  it("does not fall back the other way", async () => {
    // A general message must never go out from the billing mailbox: the
    // fallback exists for one direction only.
    process.env.BILLING_GMAIL_USER = "billing@smartautobid.com";
    process.env.BILLING_GMAIL_APP_PASSWORD = "x";
    vi.spyOn(console, "warn").mockImplementation(() => {});

    expect(await send(message)).toEqual({ status: "logged" });
  });
});
