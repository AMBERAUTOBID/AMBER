/**
 * What a website inquiry is, and what counts as a valid one.
 *
 * Kept separate from the route handler so the shape of a lead is defined in
 * one place — the contact form, the calculator's quote request and the
 * calculator's lead capture all post to the same endpoint, and all three need
 * to agree on the fields.
 */

export interface Inquiry {
  name: string;
  email: string;
  phone: string;
  vehicle: string;
  message: string;
  locale: string;
  /** ISO timestamp, stamped server-side — never trusted from the client. */
  at: string;
}

/** Anything that arrives with a submission but isn't part of the lead itself. */
export interface InquiryEnvelope {
  inquiry: Inquiry;
  recaptchaToken: string;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/**
 * Validates and normalises a raw request body.
 *
 * Returns null rather than throwing: the caller's only sensible response to
 * bad input is a 400, and an exception would be noise in the logs for what is
 * usually a bot posting garbage.
 *
 * The email check is deliberately loose. This is a lead form, not an auth
 * system — rejecting an unusual-but-valid address costs a real customer, while
 * letting a malformed one through costs one ignorable email.
 */
export function parseInquiry(body: unknown): InquiryEnvelope | null {
  if (!body || typeof body !== "object") return null;
  const raw = body as Record<string, unknown>;

  // Collapsing all whitespace runs (including CR/LF) to single spaces is
  // header-injection hardening, not cosmetics: the name is interpolated into
  // the notification email's Subject header, and a newline smuggled into a
  // header is how SMTP injection attacks start. nodemailer sanitizes too —
  // this makes us safe even if that ever regresses.
  const name = asString(raw.name).replace(/\s+/g, " ").trim();
  // The email regex rejects all whitespace outright (\S only), which keeps
  // CR/LF out of the Reply-To header by construction.
  const email = asString(raw.email);
  if (!name || !/^\S+@\S+\.\S+$/.test(email)) return null;

  return {
    inquiry: {
      name,
      email,
      phone: asString(raw.phone),
      vehicle: asString(raw.vehicle),
      message: asString(raw.message),
      locale: asString(raw.locale) || "en",
      at: new Date().toISOString(),
    },
    recaptchaToken: asString(raw.recaptchaToken),
  };
}

/** Plain-text body of the notification email. */
export function formatInquiryEmail(inquiry: Inquiry): string {
  return [
    `Name: ${inquiry.name}`,
    `Email: ${inquiry.email}`,
    `Phone: ${inquiry.phone}`,
    `Looking for: ${inquiry.vehicle}`,
    `Locale: ${inquiry.locale}`,
    `Submitted: ${inquiry.at}`,
    "",
    "Message:",
    inquiry.message || "(none)",
  ].join("\n");
}
