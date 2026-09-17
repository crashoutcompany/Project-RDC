/**
 * Mock implementation of posthog-node for Vitest.
 * This prevents API key validation errors in CI/test environments.
 */
import { vi } from "vitest";

export class PostHog {
  constructor(_apiKey?: string, _options?: Record<string, unknown>) {
    // No-op constructor - accepts any args without validation
  }

  capture = vi.fn();
  identify = vi.fn();
  alias = vi.fn();
  groupIdentify = vi.fn();
  captureException = vi.fn();
  featureFlags = vi.fn();
  getFeatureFlag = vi.fn();
  getAllFlags = vi.fn();
  isFeatureEnabled = vi.fn();
  reloadFeatureFlags = vi.fn();
  onFeatureFlags = vi.fn();
  shutdown = vi.fn().mockResolvedValue(undefined);
  flush = vi.fn().mockResolvedValue(undefined);
}

export default PostHog;
