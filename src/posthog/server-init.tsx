import { PostHog } from "posthog-node";
import config from "@/lib/config";

const posthog = new PostHog(config.NEXT_PUBLIC_POSTHOG_KEY, {
  host: config.NEXT_PUBLIC_POSTHOG_HOST,
  flushAt: 1,
  flushInterval: 0,
});

export default posthog;

// ? May want to disable posthog in development.
