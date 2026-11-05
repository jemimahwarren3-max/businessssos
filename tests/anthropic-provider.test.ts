import { afterEach, describe, expect, it, vi } from "vitest";
import { AnthropicProvider, CLAUDE_HAIKU_MODEL } from "@/lib/ai/anthropic-provider";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Anthropic provider", () => {
  it("sends the system prompt and attached logo to the configured Claude model", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockResolvedValue(
        new Response(
          JSON.stringify({
            content: [
              { type: "text", text: '{"storeName":"Green Leaf",' },
              { type: "text", text: '"tagline":"Everyday botanical care"}' },
            ],
          }),
          { status: 200 },
        ),
      ),
    );
    const provider = new AnthropicProvider("test-anthropic-key");

    await expect(
      provider.chat(
        [
          { role: "system", content: "Use only the supplied facts." },
          { role: "user", content: "Create a shop draft." },
        ],
        { mediaType: "image/png", base64: "iVBORw0KGgo=" },
      ),
    ).resolves.toBe('{"storeName":"Green Leaf","tagline":"Everyday botanical care"}');

    const [url, init] = vi.mocked(fetch).mock.calls[0]!;
    expect(String(url)).toBe("https://api.anthropic.com/v1/messages");
    expect(new Headers(init?.headers).get("x-api-key")).toBe("test-anthropic-key");
    const payload = JSON.parse(String(init?.body)) as {
      model: string;
      max_tokens: number;
      system: string;
      messages: {
        role: string;
        content: { type: string; source?: { media_type: string; data: string }; text?: string }[];
      }[];
    };
    expect(payload.model).toBe(CLAUDE_HAIKU_MODEL);
    expect(payload.system).toBe("Use only the supplied facts.");
    expect(payload.messages[0]?.content).toEqual([
      {
        type: "image",
        source: { type: "base64", media_type: "image/png", data: "iVBORw0KGgo=" },
      },
      { type: "text", text: "Create a shop draft." },
    ]);
  });

  it("requires a key and reports provider HTTP failures without response details", async () => {
    expect(() => new AnthropicProvider(" ")).toThrow(/ANTHROPIC_API_KEY/);

    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockResolvedValue(
        new Response(JSON.stringify({ error: { message: "private provider detail" } }), {
          status: 401,
        }),
      ),
    );
    await expect(
      new AnthropicProvider("test-key").chat([{ role: "user", content: "Hello" }]),
    ).rejects.toThrow("Anthropic returned HTTP 401.");
  });
});
