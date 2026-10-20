export const PRODUCT_MEDIA_BUCKET = "product-media";
export const PRODUCT_MEDIA_MAX_BYTES = 2 * 1024 * 1024;
export const PRODUCT_MEDIA_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export type ProductMediaKind = (typeof PRODUCT_MEDIA_TYPES)[number];

export function sniffProductImage(
  bytes: Uint8Array,
  declaredType: string,
): ProductMediaKind | null {
  if (bytes.length < 12 || bytes.length > PRODUCT_MEDIA_MAX_BYTES) return null;
  const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const png =
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a;
  const riff = bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46;
  const webp =
    riff && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50;

  if (jpeg && (declaredType === "image/jpeg" || declaredType === "image/jpg")) {
    return "image/jpeg";
  }
  if (png && declaredType === "image/png") return "image/png";
  if (webp && declaredType === "image/webp") return "image/webp";
  return null;
}

export function extensionForKind(kind: ProductMediaKind): string {
  if (kind === "image/png") return "png";
  if (kind === "image/webp") return "webp";
  return "jpg";
}
