import { AppError } from "@/lib/business.server";
import { checkRateLimit } from "@/lib/rate-limit.server";
import { AI_LIMITS } from "@/lib/ai/limits.server";

const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const EXTRACT_PROMPT = `You help a small shop owner digitise a photo of a sale list, invoice, or notebook page.
Reply with plain text only: names, products, quantities, prices, and dates exactly as shown.
Do not invent rows. If something is illegible, skip it or mark it as unclear.
Use one line per sale or one tab-separated row per item, whichever matches the photo.`;

type GeminiVisionResponse = {
  candidates?: { content?: { parts?: { text?: string }[] } }[];
  error?: { message?: string };
};

export async function extractQuickAddImageText(
  businessId: string,
  input: { base64: string; mimeType: string },
): Promise<string> {
  const apiKey = process.env["GEMINI_API_KEY"]?.trim();
  if (!apiKey) {
    throw new AppError(
      "Photo reading needs Gemini on the server. Type the sale or attach Excel/Word instead, or ask your admin to set GEMINI_API_KEY.",
    );
  }

  const withinDailyLimit = await checkRateLimit(
    `quick-entry-image-daily:business:${businessId}`,
    AI_LIMITS.quickEntryDaily,
    AI_LIMITS.dayWindowSeconds,
  );
  if (!withinDailyLimit) {
    throw new AppError("Quick Add has reached its daily usage limit. Please try again tomorrow.");
  }

  const mime = input.mimeType.toLowerCase();
  if (!["image/jpeg", "image/png", "image/webp"].includes(mime)) {
    throw new AppError("Use a JPEG, PNG, or WebP photo.");
  }

  const raw = input.base64.replace(/^data:[^;]+;base64,/, "");
  const bytes = Math.ceil((raw.length * 3) / 4);
  if (bytes > MAX_IMAGE_BYTES) {
    throw new AppError("That photo is too large. Use a smaller image or export to Excel.");
  }

  const model = process.env["GEMINI_MODEL"]?.trim() || "gemini-2.5-flash";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60_000);

  let response: Response;
  try {
    response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: EXTRACT_PROMPT }] },
          contents: [
            {
              role: "user",
              parts: [
                { text: "Extract sale data from this image:" },
                { inline_data: { mime_type: mime, data: raw } },
              ],
            },
          ],
          generationConfig: { maxOutputTokens: 2048, temperature: 0.2 },
        }),
        signal: controller.signal,
      },
    );
  } catch (error) {
    throw new AppError(
      `Could not read that photo (${error instanceof Error ? error.message : "network error"}).`,
    );
  } finally {
    clearTimeout(timer);
  }

  const data = (await response.json()) as GeminiVisionResponse;
  if (!response.ok) {
    throw new AppError(
      `Photo reading failed (${data.error?.message ?? `HTTP ${response.status}`}). Try Excel or typing a note.`,
    );
  }

  const text = data.candidates?.[0]?.content?.parts
    ?.map((part) => part.text ?? "")
    .join("")
    .trim();
  if (!text) throw new AppError("Could not read text from that photo. Try a clearer picture or Excel.");
  return text.slice(0, 12_000);
}
