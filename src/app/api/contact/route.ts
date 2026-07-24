import { NextResponse } from "next/server";
import nodemailer from "nodemailer";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);

  if (
    !body ||
    typeof body.name !== "string" ||
    typeof body.email !== "string" ||
    !body.name.trim() ||
    !/^\S+@\S+\.\S+$/.test(body.email)
  ) {
    return NextResponse.json(
      { ok: false, error: "Invalid submission." },
      { status: 400 }
    );
  }

  const recaptchaSecret = process.env.RECAPTCHA_SECRET_KEY;
  if (recaptchaSecret) {
    const token = typeof body.recaptchaToken === "string" ? body.recaptchaToken : "";
    if (!token) {
      return NextResponse.json(
        { ok: false, error: "Verification failed. Please try again." },
        { status: 400 }
      );
    }

    try {
      const verifyRes = await fetch("https://www.google.com/recaptcha/api/siteverify", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ secret: recaptchaSecret, response: token }),
      });
      const verify = await verifyRes.json();

      if (!verify.success || (typeof verify.score === "number" && verify.score < 0.5)) {
        console.warn("[contact] reCAPTCHA verification failed:", verify);
        return NextResponse.json(
          { ok: false, error: "Verification failed. Please try again." },
          { status: 400 }
        );
      }
    } catch (err) {
      console.error("[contact] reCAPTCHA verification request failed:", err);
      return NextResponse.json(
        { ok: false, error: "Verification failed. Please try again." },
        { status: 502 }
      );
    }
  } else {
    console.warn("[contact] RECAPTCHA_SECRET_KEY not set — skipping spam verification.");
  }

  const submission = {
    name: body.name,
    email: body.email,
    phone: body.phone ?? "",
    vehicle: body.vehicle ?? "",
    message: body.message ?? "",
    locale: body.locale ?? "en",
    at: new Date().toISOString(),
  };

  console.log("[contact] new inquiry:", submission);

  const gmailUser = process.env.GMAIL_USER;
  const gmailPass = process.env.GMAIL_APP_PASSWORD;
  const toAddress = process.env.CONTACT_EMAIL_TO || "info@smartautobid.com";

  if (!gmailUser || !gmailPass) {
    console.warn(
      "[contact] GMAIL_USER / GMAIL_APP_PASSWORD not set — inquiry logged only, no email sent."
    );
    return NextResponse.json({ ok: true });
  }

  try {
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: gmailUser, pass: gmailPass },
    });

    await transporter.sendMail({
      from: `"SmartAutoBid Website" <${gmailUser}>`,
      to: toAddress,
      replyTo: submission.email,
      subject: `New website inquiry from ${submission.name}`,
      text: [
        `Name: ${submission.name}`,
        `Email: ${submission.email}`,
        `Phone: ${submission.phone}`,
        `Looking for: ${submission.vehicle}`,
        `Locale: ${submission.locale}`,
        `Submitted: ${submission.at}`,
        "",
        "Message:",
        submission.message || "(none)",
      ].join("\n"),
    });
  } catch (err) {
    console.error("[contact] failed to send email:", err);
    return NextResponse.json(
      { ok: false, error: "Failed to send message." },
      { status: 502 }
    );
  }

  return NextResponse.json({ ok: true });
}
