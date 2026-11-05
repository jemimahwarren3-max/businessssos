import type { ReactElement } from "react";
import { Hint } from "@/components/ui/hint";

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
  return (
    <Hint tip={hint} side={side} {...(className !== undefined ? { className } : {})}>
      {children}
    </Hint>
  );
}
