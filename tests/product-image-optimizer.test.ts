import { afterEach, describe, expect, it, vi } from "vitest";
import { optimizeProductImage, resizedImageDimensions } from "@/lib/product-image-optimizer";

afterEach(() => vi.unstubAllGlobals());

describe("product image optimization", () => {
  it("resizes the longest dimension without enlarging small images", () => {
    expect(resizedImageDimensions(4000, 2000)).toEqual({ width: 1200, height: 600 });
    expect(resizedImageDimensions(600, 400)).toEqual({ width: 600, height: 400 });
    expect(() => resizedImageDimensions(0, 400)).toThrow("invalid dimensions");
  });

  it("converts oversized photos to a server-acceptable WebP before upload", async () => {
    let canvasWidth = 0;
    let canvasHeight = 0;
    const canvas = {
      set width(value: number) {
        canvasWidth = value;
      },
      get width() {
        return canvasWidth;
      },
      set height(value: number) {
        canvasHeight = value;
      },
      get height() {
        return canvasHeight;
      },
      getContext: () => ({ drawImage: vi.fn() }),
      toBlob: (callback: BlobCallback, _type?: string, quality?: number) => {
        const size = quality === 0.82 ? 2_500_000 : 1_500_000;
        callback(new Blob([new Uint8Array(size)], { type: "image/webp" }));
      },
    };
    const bitmap = {
      width: 4000,
      height: 2000,
      close: vi.fn(),
    };
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(async () => bitmap),
    );
    vi.stubGlobal("document", {
      createElement: vi.fn(() => canvas),
    });
    const file = new File([new Uint8Array(2_500_001)], "catalogue.png", { type: "image/png" });

    const optimized = await optimizeProductImage(file);

    expect(optimized.type).toBe("image/webp");
    expect(optimized.name).toBe("catalogue.webp");
    expect(optimized.size).toBe(1_500_000);
    expect(canvasWidth).toBe(1200);
    expect(canvasHeight).toBe(600);
    expect(bitmap.close).toHaveBeenCalledOnce();
  });

  it("keeps an original image when conversion would make it larger", async () => {
    const canvas = {
      width: 0,
      height: 0,
      getContext: () => ({ drawImage: vi.fn() }),
      toBlob: (callback: BlobCallback) =>
        callback(new Blob([new Uint8Array(500_000)], { type: "image/webp" })),
    };
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(async () => ({ width: 800, height: 600, close: vi.fn() })),
    );
    vi.stubGlobal("document", {
      createElement: vi.fn(() => canvas),
    });
    const file = new File([new Uint8Array(100_000)], "small.jpg", { type: "image/jpeg" });

    await expect(optimizeProductImage(file)).resolves.toBe(file);
  });
});
