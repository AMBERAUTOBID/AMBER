import "./globals.css";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Page not found — SmartAutoBid",
  description:
    "The page you're looking for doesn't exist, may have moved, or the link may be outdated.",
};

export default function GlobalNotFound() {
  return (
    <html lang="en">
      <body className="flex min-h-screen items-center justify-center bg-background px-5 text-foreground antialiased">
        <div className="max-w-lg text-center">
          <span className="text-sm font-extrabold tracking-wider text-amber-500">
            404
          </span>
          <h1 className="mt-4 text-3xl font-extrabold tracking-tight sm:text-4xl">
            Page not found
          </h1>
          <p className="mt-4 text-base leading-relaxed text-char-600">
            The page you&apos;re looking for doesn&apos;t exist, may have moved, or
            the link may be outdated.
          </p>
          <Link
            href="/"
            className="mt-8 inline-flex items-center justify-center rounded-full bg-amber-500 px-7 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-amber-600"
          >
            Back to home
          </Link>
        </div>
      </body>
    </html>
  );
}
