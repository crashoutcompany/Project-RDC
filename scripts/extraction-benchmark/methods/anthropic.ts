import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { fromLlmOutput } from "../normalize";
import type { ExtractInput, ExtractResult, Method, Price } from "./types";

/**
 * Claude via the Messages API with structured outputs.
 *
 * Thinking stays at its adaptive default (it can't be turned off on Opus 5.5)
 * and effort is "low", matching the other providers' lowest shared setting.
 * Server-side refusal fallbacks are deliberately off: a fallback would answer
 * with a different model and contaminate that model's score. A refusal is
 * recorded as a failed call instead.
 */
export function anthropicMethod(id: string, model: string, price: Price): Method {
  let client: Anthropic | undefined;
  return {
    id,
    provider: "anthropic",
    model,
    price,
    env: ["ANTHROPIC_API_KEY"],
    async extract({ spec, image, system, prompt, schema }: ExtractInput): Promise<ExtractResult> {
      client ??= new Anthropic({ maxRetries: 0 });
      const response = await client.messages.parse({
        model,
        max_tokens: 16000,
        system,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: { type: "base64", media_type: "image/png", data: image.toString("base64") },
              },
              { type: "text", text: prompt },
            ],
          },
        ],
        output_config: { format: zodOutputFormat(schema), effort: "low" },
      });

      const usage = {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        reasoningTokens: null,
      };
      if (response.stop_reason === "refusal" || !response.parsed_output)
        return {
          prediction: null,
          schemaValid: false,
          usage,
          servedBy: response.model,
          raw: { stop_reason: response.stop_reason, stop_details: response.stop_details ?? null },
        };

      return {
        prediction: fromLlmOutput(spec, response.parsed_output),
        schemaValid: true,
        usage,
        servedBy: response.model,
        raw: response.parsed_output,
      };
    },
  };
}
