export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

/** Lets the assistant swap providers later (OpenAI, a hosted model, etc.)
 * without touching the business logic that builds the prompt. */
export interface AIProvider {
  chat(messages: ChatMessage[]): Promise<string>;
}
