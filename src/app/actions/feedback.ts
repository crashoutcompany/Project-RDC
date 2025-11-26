"use server";

import { auth } from "@/lib/auth";
import { logFormSuccess } from "@/posthog/server-analytics";
import { checkBotId } from "botid/server";
import { headers } from "next/headers";
import { handlePrismaOperation } from "prisma/db";

export type FeedbackType = "bug" | "feature" | "general" | "other";

export const submitFeedback = async (
  state: { error: string | null } | undefined,
  formData: FormData,
) => {
  try {
    const verification = await checkBotId();
    const session = await auth.api.getSession({ headers: await headers() });
    if (verification.isBot || !session) {
      return { error: "Access denied" };
    }

    const feedback: FeedbackType = formData.get("type") as FeedbackType;
    const message = formData.get("message") as string;
    const userEmail = session?.user?.email;

    switch (feedback) {
      case "feature":
      case "general":
      case "other":
      case "bug":
        break;
      default:
        return { error: "Invalid feedback type" };
    }

    if (message.trim().length === 0) {
      return { error: "Message cannot be empty" };
    }

    const res = await handlePrismaOperation((prisma) =>
      prisma.feedback.create({
        data: {
          type: feedback,
          message,
          userEmail: userEmail!,
        },
      }),
    );

    if (!res.success) throw new Error(res.error);

    logFormSuccess("FEEDBACK_FORM", session);
    return { error: null };
  } catch (error) {
    console.error("Error submitting feedback:", error);
    return { error: "Failed to submit feedback" };
  }
};
