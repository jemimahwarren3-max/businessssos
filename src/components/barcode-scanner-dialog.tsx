import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { Camera } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/** Camera-based barcode scanning — the app already supports physical
 * USB/Bluetooth scanners (they just type into the search box like a
 * keyboard), but there was no way to scan with just a phone/tablet camera.
 * facingMode: "environment" asks for the back camera directly rather than
 * enumerating devices and guessing from labels — the browser picks the best
 * match, and just falls back to whatever camera is available (e.g. a
 * laptop's front camera) if there's no "environment" one. */
export function BarcodeScannerDialog({
  open,
  onOpenChange,
  onDetected,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDetected: (code: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    let detected = false;
    let controls: { stop: () => void } | undefined;
    setError(null);

    const reader = new BrowserMultiFormatReader();
    reader
      .decodeFromConstraints(
        { video: { facingMode: "environment" } },
        videoRef.current ?? undefined,
        (result) => {
          if (cancelled || detected || !result) return;
          detected = true;
          controls?.stop();
          onDetected(result.getText());
          onOpenChange(false);
        },
      )
      .then((c) => {
        if (cancelled) {
          c.stop();
        } else {
          controls = c;
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(
          err instanceof Error && err.name === "NotAllowedError"
            ? "Camera access was denied. Allow camera access in your browser to scan."
            : "Couldn't access a camera on this device.",
        );
      });

    return () => {
      cancelled = true;
      controls?.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onDetected/onOpenChange are stable enough in practice; re-running this on every render would restart the camera stream
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Camera className="size-4.5" aria-hidden="true" /> Scan a barcode
          </DialogTitle>
          <DialogDescription>Point the camera at a product's barcode.</DialogDescription>
        </DialogHeader>
        {error ? (
          <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</p>
        ) : (
          <video
            ref={videoRef}
            className="aspect-square w-full rounded-lg bg-black object-cover"
            muted
            playsInline
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
