/**
 * Delivers a website inquiry to the inbox, over Gmail SMTP.
 *
 * Note the deliberate "logged" outcome: if the Gmail credentials aren't
 * configured, the submission is still written to the server log and the
 * visitor still gets a success response. Showing someone an error because
 * *our* mail credentials are missing would lose a real lead over an
 * operational problem they can do nothing about.
 */
import nodemailer from "nodemailer";
import { SITE } from "@/shared/config/site";
import { formatInquiryEmail, type Inquiry } from "../model/inquiry";

export type DeliveryResult =
  | { status: "sent" }
  /** Credentials absent — recorded in the log, no email sent. */
  | { status: "logged" }
  | { status: "failed" };

export async function sendInquiry(inquiry: Inquiry): Promise<DeliveryResult> {
  console.log("[contact] new inquiry:", inquiry);

  const gmailUser = process.env.GMAIL_USER;
  const gmailPass = process.env.GMAIL_APP_PASSWORD;
  const toAddress = process.env.CONTACT_EMAIL_TO || SITE.email;

  if (!gmailUser || !gmailPass) {
    console.warn(
      "[contact] GMAIL_USER / GMAIL_APP_PASSWORD not set — inquiry logged only, no email sent."
    );
    return { status: "logged" };
  }

  try {
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: gmailUser, pass: gmailPass },
    });

    await transporter.sendMail({
      from: `"${SITE.name} Website" <${gmailUser}>`,
      to: toAddress,
      // So hitting Reply in the inbox answers the customer, not ourselves.
      replyTo: inquiry.email,
      subject: `New website inquiry from ${inquiry.name}`,
      text: formatInquiryEmail(inquiry),
    });
    return { status: "sent" };
  } catch (err) {
    console.error("[contact] failed to send email:", err);
    return { status: "failed" };
  }
}
