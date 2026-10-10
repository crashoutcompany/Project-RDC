import { createGoogleGenerativeAI, type GoogleLanguageModelOptions } from "@ai-sdk/google";
import { generateText, NoObjectGeneratedError, Output, type LanguageModelUsage } from "ai";
import { fromLlmOutput } from "../normalize";
import type { ExtractInput, ExtractResult, Method, Price } from "./types";

/**
 * Gemini through the Vercel AI SDK with structured output, the same path the
 * app would use in production. `thinking` is the low-effort setting for the
 * model family: Gemini 2.5 takes a token budget, Gemini 3.x takes a level.
 */
export function geminiMethod(
  id: string,
  model: string,
  price: Price,
  thinking: NonNullable<GoogleLanguageModelOptions["thinkingConfig"]>,
): Method {
  // Same override convention as the OpenAI and Anthropic SDKs' *_BASE_URL.
  const google = createGoogleGenerativeAI({ baseURL: process.env.GOOGLE_GENERATIVE_AI_BASE_URL });
  return {
    id,
    provider: "google",
    model,
    price,
    env: ["GOOGLE_GENERATIVE_AI_API_KEY"],
    async extract({ spec, image, system, prompt, schema }: ExtractInput): Promise<ExtractResult> {
      let result;
      try {
        result = await generateText({
          model: google(model),
          system,
          messages: [
            {
              role: "user",
              content: [
                { type: "file", mediaType: "image/png", data: image },
                { type: "text", text: prompt },
              ],
            },
          ],
          output: Output.object({ schema }),
          providerOptions: {
            google: { thinkingConfig: thinking } satisfies GoogleLanguageModelOptions,
          },
          maxRetries: 0,
        });
      } catch (err) {
        // Output that fails the schema throws here; the other SDKs return null.
        // Report it the same way so schema failures count identically.
        if (!NoObjectGeneratedError.isInstance(err)) throw err;
        return {
          prediction: null,
          schemaValid: false,
          usage: toUsage(err.usage),
          servedBy: err.response?.modelId ?? null,
          raw: { text: err.text ?? null, finishReason: err.finishReason ?? null },
        };
      }

      return {
        prediction: fromLlmOutput(spec, result.output),
        schemaValid: true,
        usage: toUsage(result.usage),
        servedBy: result.response.modelId,
        raw: result.output,
      };
    },
  };
}

function toUsage(usage: LanguageModelUsage | undefined) {
  return {
    inputTokens: usage?.inputTokens ?? null,
    // Includes thinking tokens (candidates + thoughts), like the other providers.
    outputTokens: usage?.outputTokens ?? null,
    reasoningTokens: usage?.outputTokenDetails.reasoningTokens ?? null,
  };
}
