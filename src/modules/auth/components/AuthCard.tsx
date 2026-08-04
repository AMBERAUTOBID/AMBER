/**
 * Shared chrome for every auth screen — the centered card, heading, and
 * footer link row — so login/register/reset can't drift apart visually.
 * Purely presentational; all behavior stays in the form components.
 */
import type { ReactNode } from "react";
import Container from "@/shared/ui/Container";

export default function AuthCard({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <Container className="flex min-h-[60vh] items-center justify-center py-16">
      <div className="w-full max-w-md rounded-2xl border border-char-200/70 bg-white p-8 shadow-sm dark:bg-char-100/5">
        <h1 className="font-[family-name:var(--font-heading)] text-2xl font-extrabold tracking-tight text-char-900">
          {title}
        </h1>
        {subtitle && <p className="mt-2 text-sm leading-relaxed text-char-600">{subtitle}</p>}
        <div className="mt-6">{children}</div>
        {footer && (
          <div className="mt-6 border-t border-char-200/70 pt-4 text-sm text-char-600">{footer}</div>
        )}
      </div>
    </Container>
  );
}
