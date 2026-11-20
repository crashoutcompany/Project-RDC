import type { UseFormReturn } from "react-hook-form";
import { insertNewSessionFromAdmin } from "@/app/actions/adminAction";
import { createSessionEditRequest } from "@/app/actions/editSession";
import type { FormValues } from "./form-helpers";
import type { SessionFormMode } from "./session-draft";

export const SUBMIT_SUCCESS: Record<SessionFormMode, string> = {
  create: "Session successfully created.",
  edit: "Edit request submitted for review.",
};

/**
 * Sends a validated form to the server: a new session is inserted, an edit
 * becomes a request for another admin to approve. Resolves to the error to
 * show, or null on success.
 */
export async function submitSession(
  mode: SessionFormMode,
  values: FormValues,
  edit: {
    sessionId?: number;
    dirtyFields: UseFormReturn<FormValues>["formState"]["dirtyFields"];
  },
): Promise<string | null> {
  if (mode === "create") return (await insertNewSessionFromAdmin(values)).error;

  if (!edit.sessionId) return "Session ID is required for editing";
  const result = await createSessionEditRequest(
    edit.sessionId,
    values,
    edit.dirtyFields,
  );
  return result.error;
}
