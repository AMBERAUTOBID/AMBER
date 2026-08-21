/**
 * Delivers a website inquiry to the inbox, over Gmail SMTP.
 *
 * Note the deliberate "logged" outcome: if the Gmail credentials aren't
 * configured, the submission is still written to the server log and the
 * visitor still gets a success response. Showing someone an error because
 * *our* mail credentials are missing would lose a real lead over an
 * operational problem they can do nothing about.
 */
import { SITE } from "@/shared/config/site";
import { formatInquiryEmail, type Inquiry } from "../model/inquiry";
import { send } from "@/shared/mail";

export type DeliveryResult =
  | { status: "sent" }
  /** Credentials absent — recorded in the log, no email sent. */
  | { status: "logged" }
  | { status: "failed" };

export async function sendInquiry(inquiry: Inquiry): Promise<DeliveryResult> {
  console.log("[contact] new inquiry:", inquiry);

  // Plain text, deliberately. This one goes to us, not to a customer: it is
  // read once, at speed, to decide whether to reply — and a layout would slow
  // that down rather than help it.
  const result = await send({
    to: process.env.CONTACT_EMAIL_TO || SITE.email,
    // So hitting Reply in the inbox answers the customer, not ourselves.
    replyTo: inquiry.email,
    subject: `New website inquiry from ${inquiry.name}`,
    text: formatInquiryEmail(inquiry),
  });

  return result.status === "failed" ? { status: "failed" } : { status: result.status };
}
