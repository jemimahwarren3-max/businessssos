import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { qrPngDataUrl } from "@/lib/qr-client";
import { cn } from "@/lib/utils";

export function QrCodeImage({
  value,
  label,
  className,
  size = 220,
}: {
  value: string;
  label: string;
  className?: string;
  size?: number;
}) {
  const [src, setSrc] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setSrc(null);
    setError(null);
    void qrPngDataUrl(value, size)
      .then((url) => {
        if (!cancelled) setSrc(url);
      })
      .catch((cause) => {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : "Could not build QR code.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [value, size]);

  if (error) {
    return <p className="text-xs text-destructive">{error}</p>;
  }

  if (!src) {
    return (
      <div
        className={cn(
          "flex items-center justify-center rounded-lg border border-border bg-muted/40",
          className,
        )}
        style={{ width: size, height: size }}
        aria-busy="true"
      >
        <Loader2 className="size-6 animate-spin text-muted-foreground" aria-hidden="true" />
      </div>
    );
  }

  return (
    <img
      src={src}
      width={size}
      height={size}
      alt={label}
      className={cn("rounded-lg border border-border bg-white p-2", className)}
    />
  );
}
