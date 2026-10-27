import type { ReactElement } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type Side = "top" | "right" | "bottom" | "left";

export function HintTooltip({
  hint,
  children,
  side = "right",
  className,
}: {
  hint: string;
  children: ReactElement;
  side?: Side;
  className?: string;
}) {
  if (!hint.trim()) return children;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent
        side={side}
        sideOffset={6}
        className={cn("max-w-[260px] text-left text-[13px] font-normal leading-snug", className)}
      >
        {hint}
      </TooltipContent>
    </Tooltip>
  );
}
