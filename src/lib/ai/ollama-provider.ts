import type { AIProvider, ChatMessage } from "./provider";

const DEFAULT_BASE_URL = "http://localhost:11434";
const DEFAULT_MODEL = "llama3.2";
const TIMEOUT_MS = 60_000;

type OllamaChatResponse = {
  message?: { role?: string; content?: string };
};

export class OllamaProvider implements AIProvider {
  private baseUrl: string;
  private model: string;

  constructor(config?: { baseUrl?: string; model?: string }) {
    this.baseUrl = config?.baseUrl || process.env["OLLAMA_BASE_URL"] || DEFAULT_BASE_URL;
    this.model = config?.model || process.env["OLLAMA_MODEL"] || DEFAULT_MODEL;
  }

  async chat(messages: ChatMessage[]): Promise<string> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: this.model, messages, stream: false }),
        signal: controller.signal,
      });
    } catch (error) {
      throw new Error(
        `Couldn't reach Ollama at ${this.baseUrl}. Is it running? (${error instanceof Error ? error.message : String(error)})`,
      );
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      throw new Error(`Ollama returned HTTP ${response.status} for model "${this.model}".`);
    }

    const data = (await response.json()) as OllamaChatResponse;
    const content = data.message?.content?.trim();
    if (!content) throw new Error("Ollama returned an empty response.");
    return content;
  }
}
