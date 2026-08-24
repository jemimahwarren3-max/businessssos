import type { AIProvider, ChatMessage } from "./provider";

// llama-3.1-8b-instant was decommissioned from Groq's catalog (calls now
// 404) — replaced with a current small/fast model. gpt-oss models reason
// before answering, so reasoning_effort is pinned to "low" below to keep
// latency/cost close to what the old instant model gave us.
const DEFAULT_MODEL = "openai/gpt-oss-20b";
const TIMEOUT_MS = 60_000;
// Every caller asks for a short answer (2-6 sentences) — this just bounds
// the worst case (cost, latency) rather than shaping normal responses.
const MAX_TOKENS = 400;

type GroqResponse = {
  choices?: { message?: { content?: string } }[];
  error?: { message?: string };
};

// Groq's free tier needs no credit card or billing account — just an API
// key from console.groq.com/keys — which Gemini's free tier does not
// reliably offer outside a specific list of billing-supported countries.
export class GroqProvider implements AIProvider {
  private apiKey: string;
  private model: string;

  constructor(config?: { apiKey?: string; model?: string }) {
    const apiKey = config?.apiKey || process.env["GROQ_API_KEY"];
    if (!apiKey) {
      throw new Error("Missing GROQ_API_KEY environment variable.");
    }
    this.apiKey = apiKey;
    this.model = config?.model || process.env["GROQ_MODEL"] || DEFAULT_MODEL;
  }

  async chat(messages: ChatMessage[]): Promise<string> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages: messages.map((m) => ({ role: m.role, content: m.content })),
          max_tokens: MAX_TOKENS,
          reasoning_effort: "low",
        }),
        signal: controller.signal,
      });
    } catch (error) {
      throw new Error(
        `Couldn't reach Groq (${error instanceof Error ? error.message : String(error)}).`,
      );
    } finally {
      clearTimeout(timer);
    }

    const data = (await response.json()) as GroqResponse;
    if (!response.ok) {
      throw new Error(
        `Groq returned HTTP ${response.status} for model "${this.model}": ${data.error?.message ?? "unknown error"}`,
      );
    }

    const content = data.choices?.[0]?.message?.content?.trim();
    if (!content) throw new Error("Groq returned an empty response.");
    return content;
  }
}
