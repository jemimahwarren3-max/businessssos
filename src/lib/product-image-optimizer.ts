import { PRODUCT_MEDIA_MAX_BYTES, PRODUCT_MEDIA_TYPES } from "./product-media";

const MAX_SOURCE_BYTES = 12 * 1024 * 1024;
const MAX_SOURCE_PIXELS = 40_000_000;
const MAX_OUTPUT_DIMENSION = 1200;
const WEBP_QUALITIES = [0.82, 0.72, 0.62, 0.52];

export function resizedImageDimensions(
  width: number,
  height: number,
  maxDimension = MAX_OUTPUT_DIMENSION,
) {
  if (width <= 0 || height <= 0) throw new Error("The selected photo has invalid dimensions.");
  const scale = Math.min(1, maxDimension / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function canvasBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error("The browser could not process this photo.")),
      "image/webp",
      quality,
    );
  });
}

export async function optimizeProductImage(file: File): Promise<File> {
  if (!PRODUCT_MEDIA_TYPES.includes(file.type as (typeof PRODUCT_MEDIA_TYPES)[number])) {
    throw new Error("Choose a JPEG, PNG, or WebP photo.");
  }
  if (file.size === 0 || file.size > MAX_SOURCE_BYTES) {
    throw new Error("Choose a photo smaller than 12 MB.");
  }

  if (typeof createImageBitmap !== "function" || typeof document === "undefined") {
    if (file.size <= PRODUCT_MEDIA_MAX_BYTES) return file;
    throw new Error(
      "This browser cannot resize the photo. Try a smaller image or another browser.",
    );
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("We couldn't open that photo. Choose a valid JPEG, PNG, or WebP image.");
  }

  try {
    if (bitmap.width * bitmap.height > MAX_SOURCE_PIXELS) {
      throw new Error("This photo has too many pixels to process safely. Resize it and try again.");
    }
    const dimensions = resizedImageDimensions(bitmap.width, bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = dimensions.width;
    canvas.height = dimensions.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("This browser could not prepare the photo for upload.");
    context.drawImage(bitmap, 0, 0, dimensions.width, dimensions.height);

    let best: Blob | null = null;
    for (const quality of WEBP_QUALITIES) {
      const output = await canvasBlob(canvas, quality);
      if (output.type !== "image/webp") break;
      if (!best || output.size < best.size) best = output;
      if (
        output.size <= PRODUCT_MEDIA_MAX_BYTES &&
        (output.size < file.size || file.size > PRODUCT_MEDIA_MAX_BYTES)
      ) {
        return new File([output], file.name.replace(/\.[^.]+$/, "") + ".webp", {
          type: "image/webp",
          lastModified: file.lastModified,
        });
      }
    }

    if (best && best.size < file.size && best.size <= PRODUCT_MEDIA_MAX_BYTES) {
      return new File([best], file.name.replace(/\.[^.]+$/, "") + ".webp", {
        type: "image/webp",
        lastModified: file.lastModified,
      });
    }
    if (file.size <= PRODUCT_MEDIA_MAX_BYTES) return file;
    throw new Error("This photo is still too large after resizing. Choose a smaller image.");
  } finally {
    bitmap.close();
  }
}
