/**
 * Validates a post-login return path.
 *
 * This is a security control, not a convenience. `/login?next=…` takes a
 * destination from the URL — i.e. from whoever wrote the link — and an
 * unvalidated one is a textbook open redirect: an attacker sends
 * `/login?next=https://evil.example/login`, the victim signs in on the real
 * site, gets bounced to a convincing copy, and types their password again
 * into it. The site's own domain in the original link is what sells it.
 *
 * So the rule is a whitelist by shape: **a path on this site, and nothing
 * else.** Anything not obviously safe is rejected in favour of the default
 * destination — a rejected return path costs the user one extra click; a
 * permitted hostile one costs them their account.
 *
 * Tested in safeReturnPath.test.ts, which is the real specification.
 */
export function safeReturnPath(raw: string | null | undefined): string | null {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 512) return null;

  // Must be site-absolute. A bare "account/plan" would resolve against
  // whatever page it's used from.
  if (!raw.startsWith("/")) return null;

  // "//evil.example" is protocol-relative — the browser reads it as a fully
  // qualified URL and leaves the site. So is "/\evil.example" and "/\\x", as
  // browsers normalise backslashes to forward slashes in URLs; rejecting
  // every backslash outright is simpler than modelling that per browser.
  if (raw.startsWith("//") || raw.includes("\\")) return null;

  // Control characters (NUL, CR, LF, tab) can split headers or truncate the
  // value differently in different parsers. Nothing legitimate contains them.
  if ([...raw].some((c) => c.charCodeAt(0) < 0x20 || c.charCodeAt(0) === 0x7f)) return null;

  // A scheme can't appear in a path, and this catches the encoded and
  // whitespace-padded spellings of "javascript:" that slip past naive checks.
  if (/^\/[\s]*[a-z][a-z0-9+.-]*:/i.test(raw)) return null;

  return raw;
}
