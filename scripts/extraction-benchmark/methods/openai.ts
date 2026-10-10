import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { fromLlmOutput } from "../normalize";
import type { ExtractInput, ExtractResult, Method, Price } from "./types";

/** OpenAI Responses API with structured outputs, reasoning effort "low". */
export function openaiMethod(id: string, model: string, price: Price): Method {
  let client: OpenAI | undefined;
  return {
    id,
    provider: "openai",
    model,
    price,
    env: ["OPENAI_API_KEY"],
    async extract({ spec, image, system, prompt, schema }: ExtractInput): Promise<ExtractResult> {
      client ??= new OpenAI({ maxRetries: 0 });
      const response = await client.responses.parse({
        model,
        instructions: system,
        input: [
          {
            role: "user",
            content: [
              {
                type: "input_image",
                image_url: `data:image/png;base64,${image.toString("base64")}`,
                detail: "auto",
              },
              { type: "input_text", text: prompt },
            ],
          },
        ],
        text: { format: zodTextFormat(schema, "scoreboard") },
        reasoning: { effort: "low" },
      });

      const usage = {
        inputTokens: response.usage?.input_tokens ?? null,
        outputTokens: response.usage?.output_tokens ?? null,
        reasoningTokens: response.usage?.output_tokens_details?.reasoning_tokens ?? null,
      };
      const parsed = response.output_parsed;
      return {
        prediction: parsed ? fromLlmOutput(spec, parsed) : null,
        schemaValid: Boolean(parsed),
        usage,
        servedBy: response.model,
        raw: parsed ?? { status: response.status, incomplete: response.incomplete_details },
      };
    },
  };
}
