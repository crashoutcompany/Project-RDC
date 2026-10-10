import { z } from "zod";
import type { ScoreboardFields } from "./analyze-scoreboard";
import { withRetry } from "./api-errors";
import { buildPrompt, buildSchema, SYSTEM_PROMPT } from "./gemini-prompt";
import { GEMINI_MODEL, GEMINI_THINKING, parseGeminiText, requireSpec, sniffMediaType } from "./gemini-reader";

/**
 * Gemini Batch API: same prompt, schema and thinking level as the interactive
 * reader, at half the price, finished within 24h (usually minutes). There's no
 * minimum size; inline requests are capped at 20 MB per job, so large runs are
 * split into several jobs that are polled together.
 */
const API = "https://generativelanguage.googleapis.com/v1beta";
const MAX_JOB_BYTES = 18 * 1024 * 1024;
const DONE_STATES = new Set(["JOB_STATE_SUCCEEDED", "JOB_STATE_FAILED", "JOB_STATE_CANCELLED", "JOB_STATE_EXPIRED"]);

export interface BatchItem {
  key: string;
  base64Source: string;
  gameId: number;
}

/** Per item: the fields, or why it has none (the caller falls back for those). */
export type BatchResult = { fields: ScoreboardFields } | { error: string };

export async function readWithGeminiBatch(
  items: BatchItem[],
  opts: {
    apiKey?: string;
    model?: string;
    pollMs?: number;
    timeoutMs?: number;
    log?: (message: string) => void;
  } = {},
): Promise<Map<string, BatchResult>> {
  const apiKey = opts.apiKey ?? process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!apiKey) throw new Error("GOOGLE_GENERATIVE_AI_API_KEY must be set for Gemini batch mode");
  const model = opts.model ?? GEMINI_MODEL;
  const log = opts.log ?? console.log;
  const results = new Map<string, BatchResult>();

  const requests = items.flatMap((item) => {
    try {
      return [{ item, body: toRequest(item) }];
    } catch (err) {
      results.set(item.key, { error: err instanceof Error ? err.message : String(err) });
      return [];
    }
  });
  const jobs = chunkBySize(requests);
  if (jobs.length === 0) return results;

  const call = (path: string, init?: RequestInit) =>
    withRetry(async () => {
      const res = await fetch(`${API}/${path}`, {
        ...init,
        headers: { "x-goog-api-key": apiKey, "content-type": "application/json" },
      });
      if (!res.ok)
        throw Object.assign(new Error(`Gemini batch ${res.status}: ${(await res.text()).slice(0, 300)}`), {
          status: res.status,
          headers: res.headers,
        });
      return res.json() as Promise<Record<string, unknown>>;
    });

  const submitted = await Promise.all(
    jobs.map(async (job, i) => {
      const created = await call(`models/${model}:batchGenerateContent`, {
        method: "POST",
        body: JSON.stringify({
          batch: {
            display_name: `rdc-scoreboards-${Date.now()}-${i + 1}`,
            input_config: {
              requests: { requests: job.map(({ item, body }) => ({ request: body, metadata: { key: item.key } })) },
            },
          },
        }),
      });
      const name = String(created.name ?? "");
      log(`[batch] job ${i + 1}/${jobs.length}: ${job.length} scoreboard(s) → ${name}`);
      return { name, job };
    }),
  );

  const deadline = Date.now() + (opts.timeoutMs ?? 24 * 60 * 60 * 1000);
  const pending = new Set(submitted);
  while (pending.size > 0) {
    for (const entry of [...pending]) {
      const status = await call(entry.name);
      const state = stateOf(status);
      if (!DONE_STATES.has(state)) continue;
      pending.delete(entry);
      log(`[batch] ${entry.name}: ${state}`);
      collect(entry.job.map((r) => r.item), status, state, results);
    }
    if (pending.size === 0) break;
    if (Date.now() > deadline) {
      for (const entry of pending)
        for (const { item } of entry.job) results.set(item.key, { error: `batch ${entry.name} not done before timeout` });
      break;
    }
    await new Promise((r) => setTimeout(r, opts.pollMs ?? 30_000));
  }
  return results;
}

function toRequest(item: BatchItem) {
  const spec = requireSpec(item.gameId);
  // Drop the JSON Schema draft URI; Gemini only needs the schema itself.
  const schema = z.toJSONSchema(buildSchema(spec)) as Record<string, unknown>;
  delete schema.$schema;
  return {
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents: [
      {
        role: "user",
        parts: [
          { inlineData: { mimeType: sniffMediaType(item.base64Source), data: item.base64Source } },
          { text: buildPrompt(spec) },
        ],
      },
    ],
    generationConfig: {
      responseMimeType: "application/json",
      responseJsonSchema: schema,
      thinkingConfig: GEMINI_THINKING,
    },
  };
}

function chunkBySize<T extends { body: unknown }>(requests: T[]): T[][] {
  const jobs: T[][] = [];
  let size = 0;
  for (const r of requests) {
    const bytes = JSON.stringify(r.body).length;
    if (jobs.length === 0 || size + bytes > MAX_JOB_BYTES) {
      jobs.push([]);
      size = 0;
    }
    jobs.at(-1)!.push(r);
    size += bytes;
  }
  return jobs;
}

// The docs show both shapes (`metadata.state` / `state`, `response` / `dest`); accept either.
// The docs say JOB_STATE_*, but the REST API answers BATCH_STATE_*; normalize to one.
function stateOf(status: Record<string, unknown>): string {
  const metadata = status.metadata as Record<string, unknown> | undefined;
  const raw = metadata?.state ?? status.state ?? (status.done ? "JOB_STATE_SUCCEEDED" : "JOB_STATE_PENDING");
  return String(raw).replace(/^BATCH_STATE_/, "JOB_STATE_");
}

type Inlined = { response?: GenerateContentResponse; error?: { message?: string }; metadata?: { key?: string } };
type GenerateContentResponse = { candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[] };

function collect(items: BatchItem[], status: Record<string, unknown>, state: string, results: Map<string, BatchResult>) {
  if (state !== "JOB_STATE_SUCCEEDED") {
    for (const item of items) results.set(item.key, { error: `batch ${state}` });
    return;
  }
  const holder = (status.response ?? status.dest ?? (status.metadata as Record<string, unknown> | undefined)?.output) as
    | Record<string, unknown>
    | undefined;
  const inlined = holder?.inlinedResponses as { inlinedResponses?: Inlined[] } | Inlined[] | undefined;
  const responses = (Array.isArray(inlined) ? inlined : inlined?.inlinedResponses) ?? [];

  items.forEach((item, i) => {
    // Results come back in request order; prefer the echoed key when present.
    const r = responses.find((x) => x.metadata?.key === item.key) ?? responses[i];
    if (!r) return results.set(item.key, { error: "missing from batch results" });
    if (r.error || !r.response) return results.set(item.key, { error: r.error?.message ?? "no response" });
    const text = (r.response.candidates?.[0]?.content?.parts ?? [])
      .filter((p) => !p.thought && p.text)
      .map((p) => p.text)
      .join("");
    try {
      results.set(item.key, { fields: parseGeminiText(requireSpec(item.gameId), text) });
    } catch (err) {
      results.set(item.key, { error: err instanceof Error ? err.message : String(err) });
    }
  });
}
