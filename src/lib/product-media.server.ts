import type { Db } from "./business.server";
import { AppError, assertCanWrite, dbFail } from "./business.server";
import {
  PRODUCT_MEDIA_BUCKET,
  PRODUCT_MEDIA_MAX_BYTES,
  extensionForKind,
  sniffProductImage,
} from "./product-media";

export async function uploadProductImage(
  supabase: Db,
  businessId: string,
  productId: string,
  file: File,
): Promise<{ imageUrl: string }> {
  await assertCanWrite(supabase, businessId);
  if (file.size <= 0 || file.size > PRODUCT_MEDIA_MAX_BYTES) {
    throw new AppError("Use a JPEG, PNG, or WebP photo under 2 MB.");
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const kind = sniffProductImage(bytes, file.type);
  if (!kind) {
    throw new AppError("Use a JPEG, PNG, or WebP photo under 2 MB.");
  }

  const path = `${businessId}/${productId}/${crypto.randomUUID()}.${extensionForKind(kind)}`;
  const { error: uploadError } = await supabase.storage
    .from(PRODUCT_MEDIA_BUCKET)
    .upload(path, bytes, { contentType: kind, upsert: false });
  if (uploadError) {
    console.error("[businessos] product photo upload", uploadError);
    throw new AppError("Couldn't save that photo. Please try again.");
  }

  const { data } = supabase.storage.from(PRODUCT_MEDIA_BUCKET).getPublicUrl(path);
  const imageUrl = data.publicUrl;
  const { error } = await supabase.rpc("set_product_image", {
    _business_id: businessId,
    _product_id: productId,
    _image_url: imageUrl,
  });
  if (error) {
    await supabase.storage
      .from(PRODUCT_MEDIA_BUCKET)
      .remove([path])
      .catch(() => undefined);
    dbFail("set product photo", error);
  }
  return { imageUrl };
}
