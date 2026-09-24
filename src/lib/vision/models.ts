import "server-only";
import { createProviderRegistry } from "ai";
import { google } from "@ai-sdk/google";
import { createAzure } from "@ai-sdk/azure";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

/**
 * Any OpenAI-compatible server: Ollama, LM Studio, vLLM, llama.cpp, etc.
 * Only reachable in `pnpm dev` or a self-hosted deployment — Vercel server
 * actions cannot reach a machine on your LAN or localhost.
 */
const local = createOpenAICompatible({
  name: "local",
  baseURL: process.env.VISION_OPENAI_BASE_URL || "http://localhost:11434/v1",
  apiKey: process.env.VISION_OPENAI_API_KEY,
  // Without this the SDK sends a bare `json_object` and the schema never
  // reaches the model. Ollama/LM Studio/vLLM/llama.cpp all accept the
  // stricter `json_schema` format this turns on.
  supportsStructuredOutputs: true,
});

// Azure OpenAI reads AZURE_API_KEY / AZURE_RESOURCE_NAME itself when not passed explicitly.
const azure = createAzure();

/**
 * Registry keyed by provider id. A model spec is "<providerId>:<modelId>",
 * e.g. "local:qwen3.8:7b", "azure:gpt-4.1-mini", "google:gemini-2.5-flash"
 * — the registry splits on the first ":" only, so a model id may itself
 * contain colons.
 */
export const visionModelRegistry = createProviderRegistry({
  local,
  azure,
  google,
});

export const DEFAULT_VISION_MODEL_SPEC = "google:gemini-2.5-flash";

export const getVisionModelSpec = (): string =>
  process.env.VISION_MODEL || DEFAULT_VISION_MODEL_SPEC;
