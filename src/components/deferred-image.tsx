import { useState, type ImgHTMLAttributes, type KeyboardEvent, type MouseEvent } from "react";
import { useLowDataMode } from "@/hooks/use-low-data-mode";
import { cn } from "@/lib/utils";

/** Product photo that stays off the wire in low-data mode until tapped.
 * Do not use for logos, auth, or MFA QR codes. */
export function DeferredImage({
  src,
  alt = "",
  className,
  ...rest
}: ImgHTMLAttributes<HTMLImageElement>) {
  const { enabled } = useLowDataMode();
  const [revealed, setRevealed] = useState(false);

  if (!src) return null;

  if (enabled && !revealed) {
    function reveal(event: MouseEvent | KeyboardEvent) {
      event.preventDefault();
      event.stopPropagation();
      setRevealed(true);
    }
    return (
      <span
        role="button"
        tabIndex={0}
        className={cn(
          "grid cursor-pointer place-items-center bg-muted px-2 text-center text-[11px] leading-snug text-muted-foreground",
          className,
        )}
        onClick={reveal}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") reveal(event);
        }}
        aria-label={alt ? `Load photo: ${alt}` : "Load photo"}
      >
        Tap to load photo
      </span>
    );
  }

  return <img src={src} alt={alt} className={className} loading="lazy" {...rest} />;
}
