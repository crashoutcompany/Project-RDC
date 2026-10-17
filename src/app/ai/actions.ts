"use server";

import { getAuthoritativeSession } from "@/lib/auth/server";
import { after } from "next/server";
import { errorCodes } from "@/lib/constants";
import { generateMvpForSession } from "@/lib/mvp/generate";
import type { ProcessedSet } from "@/lib/mvp/process-sets";
import { logMvpUpdateFailure } from "@/posthog/server-analytics";
import type { MvpOutput } from "./types";

/** Admin-only: generates the MVP for a session from the sets the admin card built client-side. */
export const analyzeMvp = async (
  sets: ProcessedSet[],
  sessionId: number,
): Promise<MvpOutput> => {
  try {
    const authSession = await getAuthoritativeSession();
    const user = authSession?.user as
      (NonNullable<typeof authSession>["user"] & { role?: string }) | undefined;
    if (!authSession || user?.role !== "admin")
      throw new Error(errorCodes.NotAuthenticated);

    if (!sessionId || sessionId <= 0) throw new Error("Invalid session ID");

    const output = await generateMvpForSession(sessionId, {
      sets,
      userSession: authSession,
    });
    if (!output) throw new Error("No sets to analyze");
    return output;
  } catch (error) {
    console.log(error);
    after(async () => await logMvpUpdateFailure(sessionId, error));
    throw error;
  }
};
