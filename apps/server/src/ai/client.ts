import Anthropic from "@anthropic-ai/sdk";

/**
 * Minimal LLM seam. `generateFlight` depends on this interface, not on the SDK,
 * so tests inject a mock and never make a real API call.
 */
export interface LlmClient {
  complete(input: { system: string; user: string }): Promise<string>;
}

/** Model is locked for Phase 2: one Opus call per generate, no tiering. */
export const MODEL = "claude-opus-4-8";
const MAX_TOKENS = 1024;

/**
 * Real client backed by the Anthropic SDK. The API key is read server-side from
 * `ANTHROPIC_API_KEY` and never exposed. Construction and the key check are
 * deferred to the first call, so a missing key surfaces as a normal failure
 * (which `generateFlight` turns into its algorithmic fallback) rather than
 * crashing at import.
 */
export function createAnthropicClient(): LlmClient {
  let sdk: Anthropic | null = null;
  return {
    async complete({ system, user }) {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        throw new Error(
          "ANTHROPIC_API_KEY is not set — cannot call the model.",
        );
      }
      sdk ??= new Anthropic({ apiKey });
      const message = await sdk.messages.create({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system,
        messages: [{ role: "user", content: user }],
      });
      return message.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("");
    },
  };
}
