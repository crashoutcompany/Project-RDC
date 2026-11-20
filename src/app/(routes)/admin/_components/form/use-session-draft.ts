import { useEffect } from "react";
import type { UseFormReturn } from "react-hook-form";
import { toast } from "sonner";
import type { FormValues } from "../../_utils/form-helpers";
import { applyDraft, readDraft, saveDraft } from "../../_utils/session-draft";

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
          localStorage.removeItem(key);
          if (!draft) return;

          // Only the draft's own changes go on top of the form as it is now,
          // so a newer approved edit isn't proposed for reverting.
          const result = applyDraft(getValues(), draft);
          if (!result)
            return void toast.error(
              "This draft was saved by an older version and can't be applied safely to this session. Please redo your changes.",
            );

          // Keeping the defaults is what marks the restored values as
          // changes, so the form can be submitted and an edit knows what it
          // changed.
          reset(result.values, { keepDefaultValues: true });
          if (result.dropped > 0)
            toast.warning(
              `${result.dropped} edited set(s) no longer exist because the session was updated, so those changes were not restored.`,
            );
        },
      },
    });
  }, [key, reset]);

  useEffect(() => {
    if (!isDirty) return;

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      saveDraft(
        localStorage,
        key,
        getValues(),
        form.formState.defaultValues as FormValues,
      );
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty, getValues, form, key]);
}
