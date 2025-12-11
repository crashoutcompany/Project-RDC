import posthog from "@/posthog/server-init";
import { auth, Session } from "@/lib/auth";
import { FormValues } from "@/app/(routes)/admin/_utils/form-helpers";
import ErrorModelOutput from "@azure-rest/ai-document-intelligence";
// import { Session } from "next-auth";
import { v4 } from "uuid";
import type { MvpOutput } from "@/app/ai/types";
import { after } from "next/server";
import { PostHogEvents } from "@/posthog/events";
import { headers } from "next/headers";

const getSession = async () => {
  try {
    return await auth.api.getSession({ headers: await headers() });
  } catch (e) {
    return null;
  }
};

/**
 * Logs an authentication error to PostHog
 * @param error - The error to log
 */
export const logAuthError = async (
  error: Error,
  userSession?: Session | null,
) => {
  try {
    const session = userSession ?? (await getSession());
    posthog.captureException(
      error,
      session?.user?.email ?? "Unidentified Email",
      {
        cause: error.cause,
      },
    );
  } catch (err) {
    console.error("Error logging authentication error:", err);
  }
};

/**
 * Logs an authentication event to PostHog
 * @param event - The name of the event to log
 * @param email - The user's email address
 */
export const logAuthEvent = async (
  event: PostHogEvents.SIGN_IN | PostHogEvents.SIGN_OUT,
  userSession?: Session | null,
) => {
  const session = userSession ?? (await getSession());
  posthog.capture({
    event,
    distinctId: session?.user?.email || v4(),
  });
};

export const logNAN = async (
  fnName: string,
  statId: number,
  userSession?: Session | null,
) => {
  const session = userSession ?? (await getSession());
  posthog.captureException(
    new Error(`NaN encountered in ${fnName} for statId ${statId}`),
    session?.user?.email || v4(),
    { fnName, statId },
  );
};

export const logFormError = async (
  err: unknown,
  session: FormValues,
  userSession?: Session | null,
) => {
  const authSession = userSession ?? (await getSession());
  posthog.captureException(err, authSession?.user?.email || v4(), {
    session: JSON.stringify(session),
  });
};

type Forms = "ADMIN_FORM" | "FEEDBACK_FORM";
export const logFormSuccess = async (
  event: Forms,
  userSession?: Session | null,
) => {
  const session = userSession ?? (await getSession());

  const eventName =
    event === "ADMIN_FORM"
      ? PostHogEvents.ADMIN_FORM_SUBMISSION_SUCCESS
      : PostHogEvents.FEEDBACK_FORM_SUBMISSION_SUCCESS;

  posthog.capture({
    event: eventName,
    distinctId: session?.user?.email || v4(),
    properties: {
      submittedAt: new Date().toISOString(),
    },
  });
};

export const logVisionError = async (
  error: typeof ErrorModelOutput | unknown,
  userSession?: Session | null,
) => {
  const session = userSession ?? (await getSession());
  posthog.captureException(error, session?.user?.email || v4());
};

export const logMvpUpdateFailure = async (
  sessionId: number,
  error: unknown,
  userSession?: Session | null,
) => {
  const session = userSession ?? (await getSession());
  posthog.captureException(error, session?.user?.email || v4(), {
    sessionId,
  });
};

export const logMvpUpdateSuccess = async (
  sessionId: number,
  mvp: MvpOutput,
  timeStamp: Date,
  duration: number,
  userSession?: Session | null,
) => {
  const session = userSession ?? (await getSession());

  posthog.capture({
    event: PostHogEvents.MVP_UPDATE_SUCCESS,
    distinctId: session?.user?.email || v4(),
    properties: {
      sessionId,
      mvp,
      timeStamp,
      fnDuration: duration,
    },
  });
};

export const logDriveCronJobError = (
  message: string,
  additionalInfo?: Record<string, unknown>,
) => {
  after(() => {
    posthog.captureException(message, "cron-job", {
      ...additionalInfo,
    });
  });
};

export const logDriveCronJobSuccess = (
  message: string,
  additionalInfo?: Record<string, unknown>,
) => {
  after(() => {
    posthog.capture({
      event: PostHogEvents.DRIVE_READ_SUCCESS,
      distinctId: "cron-job",
      properties: {
        message,
        ...additionalInfo,
      },
    });
  });
};

export const logEditSessionCleanupSuccess = (
  message: string,
  additionalInfo?: Record<string, unknown>,
) => {
  after(() => {
    posthog.capture({
      event: PostHogEvents.EDIT_SESSION_CLEANUP_SUCCESS,
      distinctId: "cron-job",
      properties: {
        message,
        ...additionalInfo,
      },
    });
  });
};

export const logEditSessionCleanupError = (
  message: string,
  additionalInfo?: Record<string, unknown>,
) => {
  after(() => {
    posthog.captureException(message, "cron-job", {
      ...additionalInfo,
    });
  });
};

export const logAiGenSuccess = (
  event: PostHogEvents,
  distinctId: string,
  additionalInfo: Record<string, unknown>,
) => {
  after(() => {
    posthog.capture({
      event,
      distinctId,
      properties: {
        ...additionalInfo,
      },
    });
  });
};

export const logAiGenFailure = (
  error: unknown,
  distinctId: string,
  additionalInfo?: Record<string, unknown>,
) => {
  after(() => {
    posthog.captureException(error, distinctId, {
      ...additionalInfo,
    });
  });
};

export const logAdminAction = async (
  event:
    | PostHogEvents.SESSION_APPROVED
    | PostHogEvents.GAME_ADDED
    | PostHogEvents.PLAYER_ADDED,
  details: Record<string, unknown>,
  userSession?: Session | null,
) => {
  const session = userSession ?? (await getSession());
  posthog.capture({
    event,
    distinctId: session?.user?.email || v4(),
    properties: details,
  });
};

export const logVisionSuccess = async (
  gameId: number,
  durationMs: number,
  userSession?: Session | null,
) => {
  const session = userSession ?? (await getSession());
  posthog.capture({
    event: PostHogEvents.VISION_ANALYSIS_SUCCESS,
    distinctId: session?.user?.email || v4(),
    properties: {
      gameId,
      durationMs,
    },
  });
};

export const logDatabaseError = async (
  error: unknown,
  userSession?: Session | null,
) => {
  const session = userSession ?? (await getSession());
  posthog.captureException(error, session?.user?.email || v4(), {
    session: JSON.stringify(session),
  });
};
