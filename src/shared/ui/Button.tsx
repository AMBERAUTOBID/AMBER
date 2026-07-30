import { clsx } from "clsx";
import { Link } from "@/i18n/navigation";
import { ArrowRight } from "@phosphor-icons/react/dist/ssr";

type Variant = "primary" | "secondary" | "ghost-light";

const variants: Record<Variant, string> = {
  primary:
    "bg-amber-500 text-white shadow-sm shadow-amber-900/20 hover:bg-amber-600 hover:shadow-md",
  secondary:
    "bg-white text-char-800 border border-char-200 hover:border-amber-400 hover:text-amber-700",
  "ghost-light":
    "bg-white/10 text-white border border-white/25 hover:bg-white/20",
};

export default function Button({
  href,
  children,
  variant = "primary",
  className,
  icon = true,
  external = false,
}: {
  href: string;
  children: React.ReactNode;
  variant?: Variant;
  className?: string;
  icon?: boolean;
  external?: boolean;
}) {
  const classes = clsx(
    "group inline-flex items-center justify-center gap-2 rounded-full px-6 py-3.5 text-sm font-semibold transition-all",
    variants[variant],
    className
  );

  const content = (
    <>
      {children}
      {icon && (
        <ArrowRight
          size={16}
          weight="bold"
          className="transition-transform group-hover:translate-x-0.5"
        />
      )}
    </>
  );

  if (external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={classes}>
        {content}
      </a>
    );
  }

  return (
    <Link href={href} className={classes}>
      {content}
    </Link>
  );
}
