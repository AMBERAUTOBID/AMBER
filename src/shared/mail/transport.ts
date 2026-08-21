/**
 * The one place mail leaves the application.
 *
 * Before this file there were three: `auth/api/sendAuthEmail.ts`,
 * `plans/api/deliver.ts` and `leads/api/sendInquiry.ts` each built their own
 * `nodemailer` transport, each read the same two environment variables, and
 * each re-implemented the same degradation. Three copies of a decision is
 * three places for it to stop agreeing — the leads mailer already formats its
 * `from` differently ("SmartAutoBid Website") from the other two, which is
 * exactly the drift this prevents.
 *
 * ## Behaviour worth knowing about
 *
 * **Without credentials it logs instead of sending.** That is not a fallback
 * that got left in; it is how local development reads a verification link
 * without an inbox, and it is why a missing environment variable does not turn
 * a working contact form into a 500 for a visitor who can do nothing about it.
 *
 * **The transport is cached per process.** Gmail's SMTP negotiates TLS and
 * authenticates on every connection; building a fresh transport per message
 * paid that cost each time. On a warm serverless instance the cache is reused,
 * and on a cold one it is built exactly as before.
 */
import nodemailer, { type Transporter } from "nodemailer";
import { SITE } from "@/shared/config/site";
import type { Outgoing } from "./types";

export type SendResult =
  | { status: "sent" }
  /** Credentials absent — written to the log, nothing left the process. */
  | { status: "logged" }
  | { status: "failed"; error: unknown };

/**
 * Which mailbox a message leaves from.
 *
 * `billing` is a **separate Google Workspace user**, not an alias, and that
 * distinction decides the whole implementation. Gmail's SMTP will not let a
 * connection put an arbitrary address in `From:` — it rewrites the header to
 * whoever authenticated, unless the address is a verified "send mail as"
 * identity on that same account. A second mailbox therefore needs a second
 * login, which is why `billing` has its own pair of environment variables
 * rather than just a different `from` string.
 *
 * Deliverability needs nothing new: same domain, and DMARC is `adkim=r`, so
 * `billing@` inherits the existing SPF, DKIM and DMARC unchanged.
 */
export type Sender = "general" | "billing";

interface Credentials {
  user: string;
  pass: string;
}

/** One transport per sender, cached for the life of the process. */
const cached = new Map<Sender, Transporter>();

const ENV: Record<Sender, { user: string; pass: string }> = {
  general: { user: "GMAIL_USER", pass: "GMAIL_APP_PASSWORD" },
  billing: { user: "BILLING_GMAIL_USER", pass: "BILLING_GMAIL_APP_PASSWORD" },
};

function read(sender: Sender): Credentials | null {
  const user = process.env[ENV[sender].user];
  const pass = process.env[ENV[sender].pass];
  return user && pass ? { user, pass } : null;
}

/**
 * Resolves a sender to a login, **falling back to `general`** when the
 * billing mailbox has no credentials configured yet.
 *
 * The fallback is deliberate. An invoice that goes out from the wrong address
 * is a cosmetic problem; an invoice that does not go out because somebody has
 * not created an app password yet is a client waiting on a car. The warning
 * makes the wrong address visible in the log rather than silent.
 */
function credentials(sender: Sender): { auth: Credentials; actual: Sender } | null {
  const own = read(sender);
  if (own) return { auth: own, actual: sender };

  if (sender !== "general") {
    const fallback = read("general");
    if (fallback) {
      console.warn(
        `[mail] ${ENV[sender].user} / ${ENV[sender].pass} unset — sending as general instead`
      );
      return { auth: fallback, actual: "general" };
    }
  }
  return null;
}

function transporter(sender: Sender, auth: Credentials): Transporter {
  const existing = cached.get(sender);
  if (existing) return existing;
  const created = nodemailer.createTransport({ service: "gmail", auth });
  cached.set(sender, created);
  return created;
}

/**
 * Sends one message, or records why it didn't.
 *
 * Callers get a result rather than an exception because the interesting cases
 * are not exceptional: the contact form wants to show success even when it
 * only logged, and the notification paths must not throw at all (see
 * `sendQuietly`).
 *
 * `html` is optional. When present the message goes out as
 * `multipart/alternative` — nodemailer builds both parts from the two fields —
 * and that pairing is what keeps an HTML email out of the spam folder. Sending
 * HTML with no text alternative is one of the oldest scoring signals there is.
 */
export async function send(message: Outgoing): Promise<SendResult> {
  const sender = message.from ?? "general";
  const resolved = credentials(sender);
  if (!resolved) {
    console.warn(
      `[mail] credentials unset — not sending "${message.subject}" to ${message.to}:\n${message.text}`
    );
    return { status: "logged" };
  }

  try {
    await transporter(resolved.actual, resolved.auth).sendMail({
      // The display name is `SITE.name` for every message, whichever mailbox
      // it leaves from. A recipient filtering or searching by sender should
      // find all of them at once; the address is what tells billing apart,
      // and the subject line is what tells the client what it is about.
      //
      // `resolved.auth.user`, never the requested address: Gmail rewrites a
      // `From:` its connection is not authorised to use, so printing the
      // address we *wanted* would put a lie in our own logs.
      from: `"${SITE.name}" <${resolved.auth.user}>`,
      to: message.to,
      replyTo: message.replyTo,
      subject: message.subject,
      text: message.text,
      html: message.html,
      attachments: message.attachments?.map((file) => ({
        filename: file.filename,
        content: Buffer.from(file.content),
        contentType: file.contentType ?? "application/pdf",
      })),
    });
    return { status: "sent" };
  } catch (error) {
    console.error(`[mail] failed to send "${message.subject}" to ${message.to}:`, error);
    return { status: "failed", error };
  }
}

/**
 * Runs a send so that a mail failure can never break what triggered it.
 *
 * Every notification in this application reports something that has **already
 * happened** — a deposit row is committed, a plan is active, a car is on a
 * ship. Throwing here would turn a completed operation into an error the
 * client would reasonably retry, and a retry cannot un-confirm a plan.
 *
 * Note the `await`: this is not fire-and-forget. A serverless platform may
 * freeze the function the moment the response is sent, so a dangling promise
 * is a notification that silently never happens (ARCHITECTURE.md §6a).
 *
 * The log line is the fallback record. If the mail didn't go, we still want to
 * know who wasn't told.
 */
export async function sendQuietly(what: string, run: () => Promise<unknown>): Promise<void> {
  try {
    await run();
  } catch (error) {
    console.error(`[mail] ${what} notification failed:`, error);
  }
}

/**
 * Drops the cached transport. Tests only — nothing in the application should
 * need to, and a caller reaching for it in a route is a sign of a problem
 * somewhere else.
 */
export function resetTransportForTests(): void {
  cached.clear();
}
