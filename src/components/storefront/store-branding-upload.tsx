import { useRef, useState } from "react";
import { Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { readableError } from "@/lib/format";
import { optimizeProductImage } from "@/lib/product-image-optimizer";
import type { StorefrontBrandingKind } from "@/lib/storefront/branding-media.server";

const ACCEPT = "image/jpeg,image/png,image/webp";

export function StoreBrandingUploadField({
  label,
  kind,
  businessId,
  currentUrl,
  disabled,
  uploadFn,
  onUploaded,
}: {
  label: string;
  kind: StorefrontBrandingKind;
  businessId: string;
  currentUrl: string;
  disabled?: boolean;
  uploadFn: (formData: FormData) => Promise<{ imageUrl: string }>;
  onUploaded: (url: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onPick(file: File | undefined) {
    if (!file || disabled) return;
    setError(null);
    setUploading(true);
    try {
      const optimized = await optimizeProductImage(file);
      const formData = new FormData();
      formData.set("businessId", businessId);
      formData.set("kind", kind);
      formData.set("file", optimized);
      const result = await uploadFn(formData);
      onUploaded(result.imageUrl);
    } catch (reason) {
      setError(readableError(reason as Error, "Could not upload that image."));
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {currentUrl ? (
        <img
          src={currentUrl}
          alt=""
          className="max-h-28 max-w-full rounded-md border object-contain"
        />
      ) : (
        <p className="text-xs text-muted-foreground">JPEG, PNG, or WebP under 2 MB.</p>
      )}
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="sr-only"
        disabled={disabled || uploading}
        onChange={(event) => void onPick(event.target.files?.[0])}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled || uploading}
        onClick={() => inputRef.current?.click()}
      >
        {uploading ? (
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        ) : (
          <Upload className="size-4" aria-hidden="true" />
        )}
        {currentUrl ? "Replace image" : "Upload image"}
      </Button>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
