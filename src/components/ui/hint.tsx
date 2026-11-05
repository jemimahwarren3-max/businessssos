import type { ReactElement } from "react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type HintSide = "top" | "right" | "bottom" | "left";

export function Hint({
  tip,
  children,
  side = "top",
  className,
}: {
  tip: string;
  children: ReactElement;
  side?: HintSide;
  className?: string;
}) {
  if (!tip.trim()) return children;

  return (
    <TooltipProvider delayDuration={400}>
      <Tooltip>
        <TooltipTrigger asChild>{children}</TooltipTrigger>
        <TooltipContent
          side={side}
          sideOffset={6}
          className={cn("max-w-[260px] text-left text-[13px] font-normal leading-snug", className)}
        >
          {tip}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
