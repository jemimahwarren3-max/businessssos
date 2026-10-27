import { Link } from "@tanstack/react-router";
import { BRAND } from "@/lib/brand";
import { cn } from "@/lib/utils";

export function Logo({
  className,
  showWord = false,
  to,
  variant = "image",
}: {
  className?: string;
  showWord?: boolean;
  to?: string;
  /** Image mark from wonder reference, or compact icon for dense app chrome. */
  variant?: "image" | "mark";
}) {
  const mark =
    variant === "image" ? (
      <span className={cn("inline-flex items-center gap-2.5", className)}>
        <img
          src="/kwetuu-logo.png"
          alt={BRAND.name}
          className="-my-2 -ml-2 h-14 w-auto"
          width={288}
          height={144}
        />
        {showWord ? (
          <span className="text-[17px] font-bold tracking-tight text-foreground">{BRAND.name}</span>
        ) : null}
      </span>
    ) : (
      <span className={cn("flex items-center gap-2.5", className)}>
        <span
          className="grid size-9 shrink-0 place-items-center rounded-xl shadow-raised"
          style={{ backgroundColor: BRAND.themeColor, color: BRAND.markOn }}
        >
          <svg viewBox="0 0 24 24" className="size-5" aria-hidden="true" fill="currentColor">
            <path d="M4 17.5V9.2a1 1 0 0 1 .45-.83l6.99-4.66a1 1 0 0 1 1.12 0l6.99 4.66a1 1 0 0 1 .45.83v8.3a1 1 0 0 1-1 1h-4.5v-5h-4v5H5a1 1 0 0 1-1-1Z" />
          </svg>
        </span>
        {showWord ? (
          <span className="text-[17px] font-bold tracking-tight text-foreground">{BRAND.name}</span>
        ) : null}
      </span>
    );

  if (to) {
    return (
      <Link to={to} className="inline-flex" aria-label={`${BRAND.name} home`}>
        {mark}
      </Link>
    );
  }
  return mark;
}
