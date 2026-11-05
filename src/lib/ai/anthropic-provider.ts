import type { AIProvider, ChatMessage } from "./provider";

export const CLAUDE_HAIKU_MODEL = "claude-haiku-5-5";
const API_URL = "https://api.anthropic.com/v1/messages";
const API_VERSION = "2023-06-01";
const TIMEOUT_MS = 60_000;
const MAX_OUTPUT_TOKENS = 1_200;

export type AnthropicImage = {
  mediaType: "image/jpeg" | "image/png" | "image/webp";
  base64: string;
};

type AnthropicResponse = {
  content?: { type: string; text?: string }[];
};

export class AnthropicProvider implements AIProvider {
  private readonly apiKey: string;

  constructor(apiKey: string) {
    if (!apiKey.trim()) throw new Error("Missing ANTHROPIC_API_KEY environment variable.");
    this.apiKey = apiKey;
  }

  async chat(messages: ChatMessage[], image?: AnthropicImage): Promise<string> {
    const system = messages
      .filter((message) => message.role === "system")
      .map((message) => message.content)
      .join("\n");
    const userMessages = messages.filter((message) => message.role !== "system");
    let lastUserIndex = -1;
    for (let index = userMessages.length - 1; index >= 0; index -= 1) {
      if (userMessages[index]?.role === "user") {
        lastUserIndex = index;
        break;
      }
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetch(API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "anthropic-version": API_VERSION,
          "x-api-key": this.apiKey,
        },
        body: JSON.stringify({
          model: CLAUDE_HAIKU_MODEL,
          max_tokens: MAX_OUTPUT_TOKENS,
          ...(system ? { system } : {}),
          messages: userMessages.map((message, index) => ({
            role: message.role,
            content:
              image && index === lastUserIndex
                ? [
                    {
                      type: "image",
                      source: {
                        type: "base64",
                        media_type: image.mediaType,
                        data: image.base64,
                      },
                    },
                    { type: "text", text: message.content },
                  ]
                : message.content,
          })),
        }),
        signal: controller.signal,
      });
    } catch (error) {
      throw new Error(
        `Couldn't reach Anthropic (${error instanceof Error ? error.message : String(error)}).`,
      );
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      throw new Error(`Anthropic returned HTTP ${response.status}.`);
    }

    let data: AnthropicResponse;
    try {
      data = (await response.json()) as AnthropicResponse;
    } catch {
      throw new Error("Anthropic returned an invalid response.");
    }
    const text = data.content
      ?.filter((block) => block.type === "text")
      .map((block) => block.text ?? "")
      .join("")
      .trim();
    if (!text) throw new Error("Anthropic returned an empty response.");
    return text;
  }
}
