/**
 * Mock implementation of posthog-node for Jest tests.
 * This prevents API key validation errors in CI/test environments.
 */
export class PostHog {
  constructor(_apiKey?: string, _options?: Record<string, unknown>) {
    // No-op constructor - accepts any args without validation
  }

  capture = jest.fn();
  identify = jest.fn();
  alias = jest.fn();
  groupIdentify = jest.fn();
  featureFlags = jest.fn();
  getFeatureFlag = jest.fn();
  getAllFlags = jest.fn();
  isFeatureEnabled = jest.fn();
  reloadFeatureFlags = jest.fn();
  onFeatureFlags = jest.fn();
  shutdown = jest.fn().mockResolvedValue(undefined);
  flush = jest.fn().mockResolvedValue(undefined);
}

export default PostHog;
