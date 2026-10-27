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
  const uploaded = await uploadProductMediaFile(supabase, businessId, productId, file);
  const { error } = await supabase.rpc("set_product_image", {
    _business_id: businessId,
    _product_id: productId,
    _image_url: uploaded.imageUrl,
  });
  if (error) {
    await supabase.storage
      .from(PRODUCT_MEDIA_BUCKET)
      .remove([uploaded.path])
      .catch(() => undefined);
    dbFail("set product photo", error);
  }
  return { imageUrl: uploaded.imageUrl };
}

export async function uploadProductGalleryImage(
  supabase: Db,
  businessId: string,
  productId: string,
  file: File,
): Promise<{ imageUrl: string }> {
  const uploaded = await uploadProductMediaFile(supabase, businessId, productId, file);
  const { error } = await supabase.rpc("add_product_listing_media", {
    _business_id: businessId,
    _product_id: productId,
    _image_url: uploaded.imageUrl,
  });
  if (error) {
    await supabase.storage
      .from(PRODUCT_MEDIA_BUCKET)
      .remove([uploaded.path])
      .catch(() => undefined);
    dbFail("add storefront product photo", error);
  }
  return { imageUrl: uploaded.imageUrl };
}

export async function removeProductGalleryImage(
  supabase: Db,
  businessId: string,
  productId: string,
  imageUrl: string,
): Promise<void> {
  await assertCanWrite(supabase, businessId);
  const { error } = await supabase.rpc("remove_product_listing_media", {
    _business_id: businessId,
    _product_id: productId,
    _image_url: imageUrl,
  });
  if (error) dbFail("remove storefront product photo", error);

  const marker = `/storage/v1/object/public/${PRODUCT_MEDIA_BUCKET}/`;
  const markerIndex = imageUrl.indexOf(marker);
  const path = markerIndex < 0 ? "" : imageUrl.slice(markerIndex + marker.length);
  if (!path.startsWith(`${businessId}/${productId}/`)) {
    throw new AppError(
      "The photo was removed from the shop, but its stored file could not be identified.",
    );
  }
  const { error: removeError } = await supabase.storage.from(PRODUCT_MEDIA_BUCKET).remove([path]);
  if (removeError) dbFail("delete storefront product photo file", removeError);
}

async function uploadProductMediaFile(
  supabase: Db,
  businessId: string,
  productId: string,
  file: File,
): Promise<{ imageUrl: string; path: string }> {
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
  return { imageUrl: data.publicUrl, path };
}
