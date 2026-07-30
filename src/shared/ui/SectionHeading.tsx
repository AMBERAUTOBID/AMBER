import { clsx } from "clsx";
import Reveal from "./Reveal";

export default function SectionHeading({
  eyebrow,
  title,
  subtitle,
  align = "left",
  dark = false,
  className,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  align?: "left" | "center";
  dark?: boolean;
  className?: string;
}) {
  return (
    <Reveal
      className={clsx(
        "max-w-2xl",
        align === "center" && "mx-auto text-center",
        className
      )}
    >
      {eyebrow && (
        <span
          className={clsx(
            "inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wider",
            dark
              ? "bg-amber-500/15 text-amber-400"
              : "bg-amber-50 text-amber-700"
          )}
        >
          {eyebrow}
        </span>
      )}
      <h2
        className={clsx(
          "mt-4 text-3xl font-extrabold tracking-tight sm:text-4xl",
          dark ? "text-white" : "text-char-900"
        )}
      >
        {title}
      </h2>
      {subtitle && (
        <p
          className={clsx(
            "mt-4 text-base leading-relaxed sm:text-lg",
            dark ? "text-char-300" : "text-char-600"
          )}
        >
          {subtitle}
        </p>
      )}
    </Reveal>
  );
}
