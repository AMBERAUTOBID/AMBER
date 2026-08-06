import { NextResponse } from "next/server";
import { parseInquiry } from "@/modules/leads/model/inquiry";
import { verifyRecaptcha } from "@/modules/leads/api/recaptcha";
import { sendInquiry } from "@/modules/leads/api/sendInquiry";
import { consumeLimit } from "@/modules/auth/model/rateLimit";
import { clientIp } from "@/modules/auth/api/http";

const INVALID = { ok: false, error: "Invalid submission." };
const UNVERIFIED = { ok: false, error: "Verification failed. Please try again." };
const TOO_MANY = { ok: false, error: "Too many messages. Please try again later." };

/**
 * Receives every lead on the site: the contact form, and both of the cost
 * calculator's paths (instant-estimate capture and quote-only request).
 *
 * Thin by design — validation, spam checking and delivery each live in
 * modules/leads. What stays here is the HTTP shape: which failure maps to
 * which status code.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = parseInquiry(body);
  if (!parsed) {
    return NextResponse.json(INVALID, { status: 400 });
  }

  // Closes the last open item from the pre-launch audit. It was deferred then
  // because rate limiting was expected to need Upstash; Phase 2 shipped a
  // Postgres-backed limiter instead, so the store already exists and the
  // `contactPerIp` rule was sitting in LIMITS unused.
  //
  // After parsing, before reCAPTCHA: a malformed body is rejected without
  // spending anyone's budget, and a flood still can't run up our Google quota
  // — reCAPTCHA is a paid-for external call, so it is the more expensive thing
  // to leave unguarded, not the cheaper one.
  //
  // reCAPTCHA does NOT make this redundant. It scores how human a submission
  // looks, not how many of them arrived; a real person with a grudge and a
  // real browser passes it every time.
  if (!(await consumeLimit("contactPerIp", clientIp(request)))) {
    return NextResponse.json(TOO_MANY, { status: 429 });
  }

  const recaptcha = await verifyRecaptcha(parsed.recaptchaToken);
  if (recaptcha.status === "rejected") {
    return NextResponse.json(UNVERIFIED, { status: 400 });
  }
  // Google being unreachable is our problem, not the visitor's - 502 so it
  // reads as a retryable server fault rather than an accusation.
  if (recaptcha.status === "unavailable") {
    return NextResponse.json(UNVERIFIED, { status: 502 });
  }

  const delivery = await sendInquiry(parsed.inquiry);
  if (delivery.status === "failed") {
    return NextResponse.json(
      { ok: false, error: "Failed to send message." },
      { status: 502 }
    );
  }

  // "logged" counts as success: the lead is captured in the server log even
  // when mail credentials are missing, and the visitor did nothing wrong.
  return NextResponse.json({ ok: true });
}
