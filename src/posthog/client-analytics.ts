"use client";

import posthog from "posthog-js";
import { PostHogEvents } from "./events";

/**
 * Gets the current PostHog session ID for linking server-side events to session replays.
 * Use this when calling server actions to pass the session ID.
 * @returns The current session ID or undefined if not available
 * @example
 * const sessionId = getSessionReplayId();
 * await myServerAction(data, sessionId);
 */
export const getSessionReplayId = (): string | undefined => {
  return posthog.get_session_id();
};

export const logChartHoverToggle = (enabled: boolean, gameName: string) => {
  posthog.capture(PostHogEvents.CHART_HOVER_TOGGLE, {
    enabled,
    gameName,
    distinctId: posthog.get_distinct_id(),
  });
};

export const logChartTabClick = (tabName: string, gameName?: string) => {
  posthog.capture(PostHogEvents.CHART_TAB_CLICKED, {
    tabName,
    gameName,
    distinctId: posthog.get_distinct_id(),
  });
};

export const logThemeToggle = (theme: string) => {
  posthog.capture(PostHogEvents.THEME_TOGGLED, {
    theme,
    distinctId: posthog.get_distinct_id(),
  });
};
