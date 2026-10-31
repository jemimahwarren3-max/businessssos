import { afterEach, describe, expect, it, vi } from "vitest";
import { GeminiProvider } from "@/lib/ai/gemini-provider";
import { getAIProvider } from "@/lib/ai/get-provider.server";
import { GroqProvider } from "@/lib/ai/groq-provider";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("Gemini provider", () => {
  it("sends server-side system and conversation messages to the Gemini API", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockResolvedValue(
        new Response(
          JSON.stringify({
            candidates: [{ content: { parts: [{ text: "Review the low-stock list." }] } }],
          }),
          { status: 200 },
        ),
      ),
    );
    const provider = new GeminiProvider({ apiKey: "test-gemini-key", model: "test-model" });

    await expect(
      provider.chat([
        { role: "system", content: "Use only the supplied facts." },
        { role: "user", content: "What should I review?" },
        { role: "assistant", content: "Your stock summary." },
      ]),
    ).resolves.toBe("Review the low-stock list.");

    const fetchMock = vi.mocked(fetch);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain("/models/test-model:generateContent");
    expect(new Headers(init?.headers).get("x-goog-api-key")).toBe("test-gemini-key");
    const payload = JSON.parse(String(init?.body)) as {
      systemInstruction: { parts: { text: string }[] };
      contents: { role: string; parts: { text: string }[] }[];
    };
    expect(payload.systemInstruction.parts[0]?.text).toBe("Use only the supplied facts.");
    expect(payload.contents.map((item) => item.role)).toEqual(["user", "model"]);
  });

  it("honours AI_PROVIDER and falls back when only one key is set", () => {
    vi.stubEnv("GEMINI_API_KEY", "test-gemini-key");
    vi.stubEnv("GROQ_API_KEY", "test-groq-key");
    vi.stubEnv("AI_PROVIDER", "");
    expect(getAIProvider()).toBeInstanceOf(GroqProvider);

    vi.stubEnv("AI_PROVIDER", "gemini");
    expect(getAIProvider()).toBeInstanceOf(GeminiProvider);

    vi.stubEnv("AI_PROVIDER", "");
    vi.stubEnv("GEMINI_API_KEY", "");
    expect(getAIProvider()).toBeInstanceOf(GroqProvider);
  });

  it("stops all model calls when AI_DISABLED or AI_PROVIDER=off", () => {
    vi.stubEnv("GROQ_API_KEY", "test-groq-key");
    vi.stubEnv("AI_DISABLED", "true");
    expect(() => getAIProvider()).toThrow(/temporarily disabled/i);
    vi.stubEnv("AI_DISABLED", "");
    vi.stubEnv("AI_PROVIDER", "off");
    expect(() => getAIProvider()).toThrow(/temporarily disabled/i);
  });
});
