import type { AIProvider } from "./provider";
import { GeminiProvider } from "./gemini-provider";
import { GroqProvider } from "./groq-provider";

export function getAIProvider(): AIProvider {
  if (process.env["GEMINI_API_KEY"]) return new GeminiProvider();
  return new GroqProvider();
}
