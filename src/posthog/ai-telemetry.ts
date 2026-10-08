import "server-only";

import { PostHogSpanProcessor } from "@posthog/ai/otel";

const DEFAULT_POSTHOG_HOST = "https://us.i.posthog.com";

type AiOtelGlobals = typeof globalThis & {
  __posthogSpanProcessor?: PostHogSpanProcessor;
};

/**
 * Custom properties attached to AI generation traces.
 * Keep names stable — PostHog reporting depends on them.
 */
export const AiTelemetryProperty = {
  ENVIRONMENT: "environment",
  SESSION_ID: "sessionId",
  SOURCE: "source",
} as const;

/**
 * Top-level runtime context keys to include in AI SDK telemetry.
 * Runtime context is omitted from traces unless each key is opted in.
 */
export const AI_TELEMETRY_INCLUDE_RUNTIME_CONTEXT = {
  distinctId: true,
  sessionId: true,
  traceName: true,
  groups: true,
  properties: true,
} as const;

/**
 * Returns an absolute PostHog host for the OTLP exporter.
 * Relative reverse-proxy paths used by the browser SDK are not valid here.
 *
 * @returns Absolute PostHog ingest host
 */
function getPostHogOtelHost(): string {
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST;
  if (host?.startsWith("http")) return host;
  return DEFAULT_POSTHOG_HOST;
}

const globals = globalThis as AiOtelGlobals;

/**
 * Shared PostHog span processor for Vercel AI SDK v7 OpenTelemetry traces.
 * Stored on `globalThis` so Next.js instrumentation and request handlers share one instance.
 */
export const posthogSpanProcessor =
  globals.__posthogSpanProcessor ??
  new PostHogSpanProcessor({
    projectToken: process.env.NEXT_PUBLIC_POSTHOG_KEY ?? "",
    host: getPostHogOtelHost(),
  });

if (!globals.__posthogSpanProcessor)
  globals.__posthogSpanProcessor = posthogSpanProcessor;

/**
 * Flushes queued AI spans to PostHog.
 * Call from `after()` so serverless requests stay alive until export finishes.
 *
 * @returns A promise that resolves when queued spans have been exported
 */
export function flushAiTelemetry(): Promise<void> {
  return posthogSpanProcessor.forceFlush();
}
