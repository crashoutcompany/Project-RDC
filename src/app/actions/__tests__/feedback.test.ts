import { vi } from "vitest";

vi.mock("botid/server", () => ({
  checkBotId: vi.fn(async () => ({ isBot: false })),
}));

import { checkBotId } from "botid/server";
import prisma from "prisma/db";
import { signInAs, TEST_USERS } from "@/test/session";
import { submitFeedback } from "../feedback";

const db = vi.mocked(prisma, { deep: true });

const feedbackForm = (type: string, message: string) => {
  const data = new FormData();
  data.set("type", type);
  data.set("message", message);
  return data;
};

beforeEach(() => signInAs("user"));

describe("submitFeedback", () => {
  it("stores feedback against the signed-in user's email", async () => {
    expect(await submitFeedback(undefined, feedbackForm("bug", "Chart is blank"))).toEqual({
      error: null,
    });
    expect(db.feedback.create).toHaveBeenCalledWith({
      data: { type: "bug", message: "Chart is blank", userEmail: TEST_USERS.user.email },
    });
  });

  it("denies bots even with a session", async () => {
    vi.mocked(checkBotId).mockResolvedValue({ isBot: true } as never);

    expect(await submitFeedback(undefined, feedbackForm("bug", "spam"))).toEqual({
      error: "Access denied",
    });
    expect(db.feedback.create).not.toHaveBeenCalled();
  });

  it("denies signed-out visitors", async () => {
    signInAs(null);

    expect(await submitFeedback(undefined, feedbackForm("bug", "hi"))).toEqual({
      error: "Access denied",
    });
    expect(db.feedback.create).not.toHaveBeenCalled();
  });

  it.each([
    ["an unknown type", "praise", "hello", "Invalid feedback type"],
    ["a blank message", "general", "   ", "Message cannot be empty"],
  ])("rejects %s", async (_label, type, message, error) => {
    expect(await submitFeedback(undefined, feedbackForm(type, message))).toEqual({ error });
    expect(db.feedback.create).not.toHaveBeenCalled();
  });

  it("hides database errors behind a generic message", async () => {
    db.feedback.create.mockRejectedValue(new Error("connection reset"));

    expect(await submitFeedback(undefined, feedbackForm("other", "hi"))).toEqual({
      error: "Failed to submit feedback",
    });
  });
});
