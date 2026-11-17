import { useEffect } from "react";
import type { UseFormReturn } from "react-hook-form";
import { toast } from "sonner";
import type { FormValues } from "../../_utils/form-helpers";
import { readDraft, saveDraft } from "../../_utils/session-draft";

/**
 * Keeps an unfinished form across page loads. Leaving with unsaved changes
 * stores them under `key` (and asks the browser to confirm); the next visit
 * offers to restore them.
 */
export function useSessionDraft(form: UseFormReturn<FormValues>, key: string) {
  const { reset, getValues } = form;
  // Reading isDirty here is what subscribes this hook to it.
  const { isDirty } = form.formState;

  useEffect(() => {
    if (!localStorage.getItem(key)) return;

    toast("Would you like to restore your previous form data?", {
      action: {
        label: "Restore",
        onClick: () => {
          const draft = readDraft(localStorage, key);
          // Keeping the defaults is what marks the restored values as
          // changes, so the form can be submitted and an edit knows what it
          // changed.
          if (draft) reset(draft, { keepDefaultValues: true });
          localStorage.removeItem(key);
        },
      },
    });
  }, [key, reset]);

  useEffect(() => {
    if (!isDirty) return;

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      saveDraft(localStorage, key, getValues());
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty, getValues, key]);
}
