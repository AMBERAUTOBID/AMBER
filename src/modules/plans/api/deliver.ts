/**
 * The plans module's outgoing mail.
 *
 * Same Gmail transport and the same "log instead of send" degradation as the
 * auth and leads mailers — without credentials the message is written to the
 * server log, which in local dev is also how you read what would have gone
 * out without needing an inbox.
 *
 * Plain text on purpose. HTML mail buys spam-filter surface and rendering
 * bugs for content that is a few lines and a link.
 */
import nodemailer from "nodemailer";
import { SITE } from "@/shared/config/site";

export interface Outgoing {
  to: string;
  subject: string;
  text: string;
  /** Set when a reply should reach the customer rather than ourselves. */
  replyTo?: string;
}

export async function deliver(message: Outgoing): Promise<void> {
  const gmailUser = process.env.GMAIL_USER;
  const gmailPass = process.env.GMAIL_APP_PASSWORD;
  if (!gmailUser || !gmailPass) {
    console.warn(`[plans] mail credentials unset — would send to ${message.to}:\n${message.text}`);
    return;
  }

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user: gmailUser, pass: gmailPass },
  });
  await transporter.sendMail({
    from: `"${SITE.name}" <${gmailUser}>`,
    to: message.to,
    replyTo: message.replyTo,
    subject: message.subject,
    text: message.text,
  });
}

/**
 * Wraps a send so a mail failure can never break the action that triggered
 * it. Every caller in this module is reporting something that ALREADY
 * happened — a deposit row is committed, a plan is active — so throwing here
 * would turn a completed operation into an error the client would reasonably
 * retry, and a retry can't un-confirm a plan.
 *
 * The log line is the fallback record: if the mail didn't go, we want to know
 * who wasn't told.
 */
export async function deliverQuietly(what: string, send: () => Promise<void>): Promise<void> {
  try {
    await send();
  } catch (e) {
    console.error(`[plans] ${what} notification failed:`, e);
  }
}
