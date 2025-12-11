import posthog from "posthog-js";
import { initBotId } from "botid/client/core";

// The instrumentation-client.ts file allows you to add monitoring and analytics code that runs before your application's frontend code starts executing.

posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY as string, {
  api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
  person_profiles: "identified_only", // or 'always' to create profiles for anonymous users as well
  defaults: "2025-11-30",
  capture_exceptions: true, // This enables capturing exceptions using Error Tracking
  debug: process.env.NODE_ENV === "development",
  // Session Replay configuration
  disable_session_recording: false,
  session_recording: {
    maskAllInputs: false, // Set to true to mask all input fields
    maskTextSelector: "[data-mask]", // Mask elements with this attribute
  },
});

/**
 * Gets the current PostHog session ID for linking server-side events to session replays.
 * @returns The current session ID or undefined if not available
 */
export const getPostHogSessionId = (): string | undefined => {
  return posthog.get_session_id();
};

// Define the paths that need bot protection.
// These are paths that are routed to by your app.
// These can be:
// - API endpoints (e.g., '/api/checkout')
// - Server actions invoked from a page (e.g., '/dashboard')
// - Dynamic routes (e.g., '/api/create/*')

initBotId({
  protect: [
    {
      path: "/feedback",
      method: "POST",
    },
  ],
});
