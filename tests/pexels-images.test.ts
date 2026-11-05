import { afterEach, describe, expect, it, vi } from "vitest";

const { checkRateLimitMock } = vi.hoisted(() => ({
  checkRateLimitMock: vi.fn(async () => true),
}));
vi.mock("@/lib/rate-limit.server", () => ({ checkRateLimit: checkRateLimitMock }));

import {
  isPexelsImageSearchConfigured,
  isPexelsImageUrl,
  searchPexelsPhotos,
} from "@/lib/pexels.server";

afterEach(() => {
  checkRateLimitMock.mockReset();
  checkRateLimitMock.mockResolvedValue(true);
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function pexelsPhoto(id: number, imageUrl = `https://images.pexels.com/photos/${id}/photo.jpeg`) {
  return {
    id,
    alt: `Photo ${id}`,
    photographer: `Photographer ${id}`,
    photographer_url: `https://www.pexels.com/@photographer-${id}`,
    src: { large: imageUrl },
  };
}

describe("Pexels product photo search", () => {
  it("reports unavailable and does not call Pexels when the server key is missing", async () => {
    vi.stubEnv("PEXELS_API_KEY", "");
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);

    expect(isPexelsImageSearchConfigured()).toBe(false);
    await expect(searchPexelsPhotos("white sugar")).rejects.toThrow(
      "Pexels photo search is not configured.",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("requests nine results using the server-only key and returns safe photo URLs", async () => {
    vi.stubEnv("PEXELS_API_KEY", "server-api-key");
    const fetchMock = vi.fn<typeof fetch>(async () =>
      Response.json({ photos: Array.from({ length: 9 }, (_, index) => pexelsPhoto(index + 1)) }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const photos = await searchPexelsPhotos("white sugar");

    expect(isPexelsImageSearchConfigured()).toBe(true);
    expect(photos).toHaveLength(9);
    expect(photos[0]).toMatchObject({
      id: 1,
      imageUrl: "https://images.pexels.com/photos/1/photo.jpeg",
      photographer: "Photographer 1",
      photographerUrl: "https://www.pexels.com/@photographer-1",
    });
    const [requestUrl, requestInit] = fetchMock.mock.calls[0]!;
    const url = new URL(String(requestUrl));
    expect(url.searchParams.get("query")).toBe("white sugar");
    expect(url.searchParams.get("per_page")).toBe("9");
    expect(requestInit?.headers).toEqual({ Authorization: "server-api-key" });
    expect(checkRateLimitMock).toHaveBeenNthCalledWith(
      1,
      "pexels-image-search:hourly",
      180,
      60 * 60,
    );
    expect(checkRateLimitMock).toHaveBeenNthCalledWith(
      2,
      "pexels-image-search:daily",
      500,
      24 * 60 * 60,
    );
  });

  it("filters image URLs outside the Pexels image CDN", async () => {
    vi.stubEnv("PEXELS_API_KEY", "server-api-key");
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () =>
        Response.json({
          photos: [
            pexelsPhoto(1),
            pexelsPhoto(2, "https://images.pexels.com.evil.example/photos/2/photo.jpeg"),
          ],
        }),
      ),
    );

    await expect(searchPexelsPhotos("sugar")).resolves.toHaveLength(1);
    expect(isPexelsImageUrl("https://images.pexels.com/photos/1/photo.jpeg")).toBe(true);
    expect(isPexelsImageUrl("https://images.pexels.com.evil.example/photos/1/photo.jpeg")).toBe(
      false,
    );
    expect(isPexelsImageUrl("http://images.pexels.com/photos/1/photo.jpeg")).toBe(false);
  });

  it("surfaces API failures without exposing provider response details", async () => {
    vi.stubEnv("PEXELS_API_KEY", "server-api-key");
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () => new Response("private provider details", { status: 429 })),
    );

    await expect(searchPexelsPhotos("sugar")).rejects.toThrow(
      "Pexels photo search is temporarily unavailable.",
    );
  });

  it("does not call Pexels when the shared provider quota is reached", async () => {
    vi.stubEnv("PEXELS_API_KEY", "server-api-key");
    checkRateLimitMock.mockResolvedValueOnce(false);
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);

    await expect(searchPexelsPhotos("sugar")).rejects.toThrow(
      "Photo search has reached its limit.",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
