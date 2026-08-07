import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

export function Logo({
  className,
  showWord = true,
  to,
}: {
  className?: string;
  showWord?: boolean;
  to?: string;
}) {
  const mark = (
    <span className={cn("flex items-center gap-2.5", className)}>
      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground shadow-raised">
        <svg viewBox="0 0 24 24" className="size-5" aria-hidden="true" fill="none">
          <path
            d="M4 17.5V9.2a1 1 0 0 1 .45-.83l6.99-4.66a1 1 0 0 1 1.12 0l6.99 4.66a1 1 0 0 1 .45.83v8.3a1 1 0 0 1-1 1h-4.5v-5h-4v5H5a1 1 0 0 1-1-1Z"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      {showWord ? (
        <span className="text-[17px] font-bold tracking-tight text-foreground">
          BusinessOS <span className="text-primary">AI</span>
        </span>
      ) : null}
    </span>
  );

  if (to) {
    return (
      <Link to={to} className="inline-flex" aria-label="BusinessOS AI home">
        {mark}
      </Link>
    );
  }
  return mark;
}
