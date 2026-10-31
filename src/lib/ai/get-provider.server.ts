import type { AIProvider } from "./provider";
import { GeminiProvider } from "./gemini-provider";
import { GroqProvider } from "./groq-provider";

export type AIProviderName = "gemini" | "groq";

function aiIsDisabled(): boolean {
  const flag = process.env["AI_DISABLED"]?.trim().toLowerCase();
  const preferred = process.env["AI_PROVIDER"]?.trim().toLowerCase();
  return flag === "true" || flag === "1" || preferred === "off";
}

function configuredProvider(): AIProviderName | null {
  const hasGemini = Boolean(process.env["GEMINI_API_KEY"]?.trim());
  const hasGroq = Boolean(process.env["GROQ_API_KEY"]?.trim());
  const preferred = process.env["AI_PROVIDER"]?.trim().toLowerCase();

  if (preferred === "gemini" || preferred === "groq") {
    return preferred;
  }
  if (hasGroq && !hasGemini) return "groq";
  if (hasGemini && !hasGroq) return "gemini";
  if (hasGroq && hasGemini) {
    // Both keys are often left on by mistake — default to Groq unless AI_PROVIDER is set.
    return "groq";
  }
  return null;
}

export function getAIProvider(): AIProvider {
  if (aiIsDisabled()) {
    throw new Error(
      "AI is temporarily disabled. Shops, POS, and orders still work. Set AI_DISABLED=false or AI_PROVIDER to groq/gemini to resume.",
    );
  }
  const choice = configuredProvider();
  if (choice === "gemini") {
    if (!process.env["GEMINI_API_KEY"]?.trim()) {
      throw new Error("AI_PROVIDER=gemini but GEMINI_API_KEY is not set.");
    }
    return new GeminiProvider();
  }
  if (choice === "groq") {
    if (!process.env["GROQ_API_KEY"]?.trim()) {
      throw new Error("AI_PROVIDER=groq but GROQ_API_KEY is not set.");
    }
    return new GroqProvider();
  }
  return new GroqProvider();
}
