"use client";

import { useEffect } from "react";
import { authClient } from "@/lib/auth-client";
import posthog from "posthog-js";

export default function PostHogIdentify() {
  const { data: session } = authClient.useSession();

  useEffect(() => {
    if (session?.user?.id) {
      posthog.identify(session.user.id);
    }
  }, [session?.user?.id]);

  return null; // This component doesn't render anything
}
// It just ensures PostHog is initialized with the user's id (never the email)
