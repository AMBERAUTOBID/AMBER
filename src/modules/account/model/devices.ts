import { cookies } from "next/headers";
import {
  SESSION_COOKIE,
  listSessionsForUser,
  type SessionRow,
} from "@/modules/auth/model/session";

export interface Device extends SessionRow {
  /** Best-effort "Chrome on Windows". Presentation only — see below. */
  label: string;
}

/**
 * The signed-in devices for the current user, newest first, with the browser
 * asking marked as current.
 *
 * Reads the cookie here rather than taking a token argument so pages don't
 * have to handle it; the session module stays free of `next/headers`.
 */
export async function signedInDevices(userId: string): Promise<Device[]> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value ?? null;
  const rows = await listSessionsForUser(userId, token);
  return rows.map((row) => ({ ...row, label: describeUserAgent(row.userAgent) }));
}

/**
 * Turns a user-agent string into something a person can recognise.
 *
 * **Presentation only — never make a decision on this.** User agents are
 * self-reported, every browser lies about being several others (Edge claims
 * Chrome and Safari; Chrome claims Mozilla), and the string can be anything a
 * client sends. Its one job here is helping someone answer "is that me?", and
 * the raw string is useless for that: nobody recognises themselves in
 * "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ...".
 *
 * Order matters — the more specific brands must be tested before the ones
 * they impersonate.
 */
export function describeUserAgent(ua: string | null): string {
  if (!ua) return "";

  const browser =
    /\bEdg[A-Z]?\//.test(ua) ? "Edge"
    : /\bOPR\/|\bOpera\//.test(ua) ? "Opera"
    : /\bFirefox\//.test(ua) ? "Firefox"
    : /\bSamsungBrowser\//.test(ua) ? "Samsung Internet"
    : /\bChrome\//.test(ua) ? "Chrome"
    : /\bSafari\//.test(ua) ? "Safari"
    : "";

  const os =
    /\bWindows NT\b/.test(ua) ? "Windows"
    : /\biPhone\b/.test(ua) ? "iPhone"
    : /\biPad\b/.test(ua) ? "iPad"
    : /\bAndroid\b/.test(ua) ? "Android"
    : /\bMac OS X\b/.test(ua) ? "macOS"
    : /\bLinux\b/.test(ua) ? "Linux"
    : "";

  if (browser && os) return `${browser} on ${os}`;
  // Something we don't recognise. Show the raw string, truncated, rather
  // than a confident guess — an unfamiliar entry is exactly the one the
  // client most needs to see honestly.
  return browser || os || ua.slice(0, 60);
}
