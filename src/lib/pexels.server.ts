import { z } from "zod";
import type { Db } from "./business.server";
import { AppError, assertCanWrite, dbFail } from "./business.server";
import { checkRateLimit } from "./rate-limit.server";

const pexelsResponseSchema = z.object({
  photos: z.array(
    z.object({
      id: z.number().int().positive(),
      alt: z.string().max(500).optional().default(""),
      photographer: z.string().max(120).optional().default(""),
      photographer_url: z.string().url().optional(),
      src: z.object({ large: z.string().url() }),
    }),
  ),
});

export type PexelsPhoto = {
  id: number;
  imageUrl: string;
  alt: string;
  photographer: string;
  photographerUrl: string | null;
};

export function isPexelsImageUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.hostname === "images.pexels.com" &&
      !url.port &&
      /^\/photos\/\d+\//.test(url.pathname) &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}

export function isPexelsImageSearchConfigured(): boolean {
  return Boolean(process.env["PEXELS_API_KEY"]?.trim());
}

export async function searchPexelsPhotos(query: string): Promise<PexelsPhoto[]> {
  const apiKey = process.env["PEXELS_API_KEY"]?.trim();
  if (!apiKey) throw new AppError("Pexels photo search is not configured.");

  const normalizedQuery = query.trim();
  if (!normalizedQuery || normalizedQuery.length > 100) {
    throw new AppError("Enter a product name up to 100 characters.");
  }

  const [withinHourlyLimit, withinDailyLimit] = await Promise.all([
    checkRateLimit("pexels-image-search:hourly", 180, 60 * 60),
    checkRateLimit("pexels-image-search:daily", 500, 24 * 60 * 60),
  ]);
  if (!withinHourlyLimit || !withinDailyLimit) {
    throw new AppError("Photo search has reached its limit. Please try again later.");
  }

  let response: Response;
  try {
    response = await fetch(
      `https://api.pexels.com/v1/search?query=${encodeURIComponent(normalizedQuery)}&per_page=9`,
      {
        headers: { Authorization: apiKey },
        signal: AbortSignal.timeout(10_000),
      },
    );
  } catch (error) {
    console.error("[businessos] Pexels image search request failed", error);
    throw new AppError("Pexels photo search is temporarily unavailable. Please try again.");
  }

  if (!response.ok) {
    console.error("[businessos] Pexels image search returned an error", response.status);
    throw new AppError("Pexels photo search is temporarily unavailable. Please try again.");
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch (error) {
    console.error("[businessos] Pexels image search returned invalid JSON", error);
    throw new AppError("Pexels returned an invalid response. Please try again.");
  }

  const parsed = pexelsResponseSchema.safeParse(body);
  if (!parsed.success) {
    console.error("[businessos] Pexels image search returned an invalid payload", parsed.error);
    throw new AppError("Pexels returned an invalid response. Please try again.");
  }

  return parsed.data.photos
    .filter((photo) => isPexelsImageUrl(photo.src.large))
    .slice(0, 9)
    .map((photo) => {
      let photographerUrl: string | null = null;
      if (photo.photographer_url) {
        try {
          const url = new URL(photo.photographer_url);
          if (
            url.protocol === "https:" &&
            url.hostname === "www.pexels.com" &&
            !url.port &&
            !url.username &&
            !url.password
          ) {
            photographerUrl = url.href;
          }
        } catch {
          photographerUrl = null;
        }
      }

      return {
        id: photo.id,
        imageUrl: photo.src.large,
        alt: photo.alt,
        photographer: photo.photographer,
        photographerUrl,
      };
    });
}

export async function setPexelsProductImage(
  supabase: Db,
  businessId: string,
  productId: string,
  imageUrl: string,
): Promise<void> {
  if (!isPexelsImageUrl(imageUrl)) {
    throw new AppError("Choose a valid Pexels photo.");
  }

  await assertCanWrite(supabase, businessId);
  const { error } = await supabase.rpc("set_product_image", {
    _business_id: businessId,
    _product_id: productId,
    _image_url: imageUrl,
  });
  if (error) dbFail("save Pexels product photo", error);
}
