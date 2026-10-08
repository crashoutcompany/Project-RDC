"use client";

import posthog from "posthog-js";
import { PostHogProvider } from "posthog-js/react";

import { type JSX } from "react";

export function CSPostHogProvider({
  children,
}: {
  children: React.ReactNode;
}): JSX.Element {
  return <PostHogProvider client={posthog}>{children}</PostHogProvider>;
}

// ? May want to disable posthog in development.
