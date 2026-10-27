import type { AIProvider, ChatMessage } from "./provider";

const DEFAULT_MODEL = "gemini-2.5-flash";
const TIMEOUT_MS = 60_000;

type GeminiResponse = {
  candidates?: {
    content?: { parts?: { text?: string }[] };
  }[];
  error?: { message?: string };
};

export class GeminiProvider implements AIProvider {
  private readonly apiKey: string;
  private readonly model: string;

  constructor(config?: { apiKey?: string; model?: string }) {
    const apiKey = config?.apiKey || process.env["GEMINI_API_KEY"];
    if (!apiKey) throw new Error("Missing GEMINI_API_KEY environment variable.");
    this.apiKey = apiKey;
    this.model = config?.model || process.env["GEMINI_MODEL"] || DEFAULT_MODEL;
  }

  async chat(messages: ChatMessage[]): Promise<string> {
    const systemInstruction = messages.find((message) => message.role === "system")?.content;
    const contents = messages
      .filter((message) => message.role !== "system")
      .map((message) => ({
        role: message.role === "assistant" ? "model" : "user",
        parts: [{ text: message.content }],
      }));
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.model)}:generateContent`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": this.apiKey,
          },
          body: JSON.stringify({
            ...(systemInstruction
              ? { systemInstruction: { parts: [{ text: systemInstruction }] } }
              : {}),
            contents,
            generationConfig: { maxOutputTokens: 1024, temperature: 0.4 },
          }),
          signal: controller.signal,
        },
      );
    } catch (error) {
      throw new Error(
        `Couldn't reach Gemini (${error instanceof Error ? error.message : String(error)}).`,
      );
    } finally {
      clearTimeout(timer);
    }

    const data = (await response.json()) as GeminiResponse;
    if (!response.ok) {
      throw new Error(
        `Gemini returned HTTP ${response.status}: ${data.error?.message ?? "unknown error"}`,
      );
    }

    const content = data.candidates?.[0]?.content?.parts
      ?.map((part) => part.text ?? "")
      .join("")
      .trim();
    if (!content) throw new Error("Gemini returned an empty response.");
    return content;
  }
}
