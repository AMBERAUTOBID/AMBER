/**
 * Server-side reCAPTCHA v3 verification for the contact endpoint.
 *
 * v3 returns a 0-1 score rather than a pass/fail, so the threshold is ours to
 * pick. 0.5 is Google's documented default and errs toward letting borderline
 * humans through — for a lead form, a false rejection costs a customer while a
 * false accept costs one ignorable email.
 */
const SITEVERIFY_URL = "https://www.google.com/recaptcha/api/siteverify";
const MIN_SCORE = 0.5;

export type RecaptchaResult =
  | { status: "ok" }
  /** Token missing, or the score came back below the threshold. */
  | { status: "rejected" }
  /** Google itself was unreachable — distinct from "this looks like a bot",
   * because the caller should return 502 rather than blame the visitor. */
  | { status: "unavailable" }
  /** No secret configured, so verification was skipped entirely. */
  | { status: "not-configured" };

export async function verifyRecaptcha(token: string): Promise<RecaptchaResult> {
  const secret = process.env.RECAPTCHA_SECRET_KEY;
  if (!secret) {
    console.warn("[contact] RECAPTCHA_SECRET_KEY not set — skipping spam verification.");
    return { status: "not-configured" };
  }
  if (!token) return { status: "rejected" };

  try {
    const res = await fetch(SITEVERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret, response: token }),
    });
    const verify = (await res.json()) as { success?: boolean; score?: number };

    if (!verify.success || (typeof verify.score === "number" && verify.score < MIN_SCORE)) {
      console.warn("[contact] reCAPTCHA verification failed:", verify);
      return { status: "rejected" };
    }
    return { status: "ok" };
  } catch (err) {
    console.error("[contact] reCAPTCHA verification request failed:", err);
    return { status: "unavailable" };
  }
}
