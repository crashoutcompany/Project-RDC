import "server-only";

import { OpenTelemetry } from "@ai-sdk/otel";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { registerTelemetry } from "ai";
import { AiTelemetryProperty, posthogSpanProcessor } from "./ai-telemetry";

type AiOtelGlobals = typeof globalThis & {
  __aiTelemetryStarted?: boolean;
};

type GlobalRecord = Record<string, unknown>;

/**
 * Returns a string when `value` is a string, otherwise undefined.
 *
 * @param value - Unknown runtime context field
 * @returns The string value, or undefined
 */
function asString(value: unknown): string | undefined {
  if (typeof value === "string") return value;
}

/**
 * Returns a plain object when `value` is a non-array object.
 *
 * @param value - Unknown runtime context field
 * @returns The object value, or undefined
 */
function asRecord(value: unknown): GlobalRecord | undefined {
  if (typeof value === "object" && value !== null && !Array.isArray(value))
    return value as GlobalRecord;
}

/**
 * Starts the OpenTelemetry SDK and registers the AI SDK telemetry integration.
 * Safe to call more than once; subsequent calls are no-ops.
 *
 * Must run in the Node.js runtime before the first AI SDK call.
 */
export function startAiTelemetry(): void {
  const globals = globalThis as AiOtelGlobals;
  if (globals.__aiTelemetryStarted) return;
  globals.__aiTelemetryStarted = true;

  const sdk = new NodeSDK({
    resource: resourceFromAttributes({
      "service.name": "project-rdc",
    }),
    spanProcessors: [posthogSpanProcessor],
  });
  sdk.start();

  registerTelemetry(
    new OpenTelemetry({
      enrichSpan: ({ runtimeContext }) => {
        const properties = asRecord(runtimeContext?.properties);
        const groups = asRecord(runtimeContext?.groups);
        const customProperties: Record<string, string | number | boolean> = {};

        if (properties)
          for (const [key, value] of Object.entries(properties))
            if (
              typeof value === "string" ||
              typeof value === "number" ||
              typeof value === "boolean"
            )
              customProperties[key] = value;

        return {
          ...customProperties,
          environment:
            asString(properties?.[AiTelemetryProperty.ENVIRONMENT]) ??
            customProperties[AiTelemetryProperty.ENVIRONMENT],
          "posthog.distinct_id": asString(runtimeContext?.distinctId),
          $ai_session_id: asString(runtimeContext?.sessionId),
          $ai_trace_name: asString(runtimeContext?.traceName),
          $groups: groups ? JSON.stringify(groups) : undefined,
        };
      },
    }),
  );
}
