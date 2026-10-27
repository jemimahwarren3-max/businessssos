import type { Db } from "../business.server";
import { AppError, assertCanWrite, dbFail } from "../business.server";
import {
  PRODUCT_MEDIA_BUCKET,
  PRODUCT_MEDIA_MAX_BYTES,
  extensionForKind,
  sniffProductImage,
} from "../product-media";

export type StorefrontBrandingKind = "logo" | "cover";

export async function uploadStorefrontBrandingImage(
  supabase: Db,
  businessId: string,
  kind: StorefrontBrandingKind,
  file: File,
): Promise<{ imageUrl: string }> {
  await assertCanWrite(supabase, businessId);
  if (file.size <= 0 || file.size > PRODUCT_MEDIA_MAX_BYTES) {
    throw new AppError("Use a JPEG, PNG, or WebP photo under 2 MB.");
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const mime = sniffProductImage(bytes, file.type);
  if (!mime) {
    throw new AppError("Use a JPEG, PNG, or WebP photo under 2 MB.");
  }

  const path = `${businessId}/storefront/${kind}/${crypto.randomUUID()}.${extensionForKind(mime)}`;
  const { error: uploadError } = await supabase.storage
    .from(PRODUCT_MEDIA_BUCKET)
    .upload(path, bytes, { contentType: mime, upsert: false });
  if (uploadError) {
    console.error("[businessos] storefront branding upload", uploadError);
    throw new AppError("Couldn't save that photo. Please try again.");
  }

  const { data } = supabase.storage.from(PRODUCT_MEDIA_BUCKET).getPublicUrl(path);
  return { imageUrl: data.publicUrl };
}

export async function removeStorefrontBrandingFile(
  supabase: Db,
  businessId: string,
  imageUrl: string,
): Promise<void> {
  await assertCanWrite(supabase, businessId);
  const marker = `/storage/v1/object/public/${PRODUCT_MEDIA_BUCKET}/`;
  const markerIndex = imageUrl.indexOf(marker);
  const path = markerIndex < 0 ? "" : imageUrl.slice(markerIndex + marker.length);
  if (!path.startsWith(`${businessId}/storefront/`)) {
    return;
  }
  const { error } = await supabase.storage.from(PRODUCT_MEDIA_BUCKET).remove([path]);
  if (error) dbFail("delete storefront branding file", error);
}
