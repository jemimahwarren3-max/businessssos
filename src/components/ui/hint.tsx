import { useRef, useState, type ReactElement } from "react";
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
  const [open, setOpen] = useState(false);
  const touchRef = useRef(false);

  if (!tip.trim()) return children;

  return (
    <TooltipProvider delayDuration={400}>
      <Tooltip open={open} onOpenChange={setOpen}>
        <TooltipTrigger
          asChild
          onPointerDown={(event) => {
            touchRef.current = event.pointerType === "touch";
          }}
          onClick={() => {
            if (touchRef.current) setOpen(true);
          }}
        >
          {children}
        </TooltipTrigger>
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
