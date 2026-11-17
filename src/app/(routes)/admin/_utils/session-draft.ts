import type { FormValues } from "./form-helpers";

export type SessionFormMode = "create" | "edit";

/**
 * Where an unfinished form is kept between page loads. Each edited session
 * has its own draft, so a draft is only ever offered back to the form it
 * came from.
 */
export const draftKey = (mode: SessionFormMode, sessionId?: number) =>
  mode === "edit" ? `entryCreatorForm:edit:${sessionId}` : "entryCreatorForm";

export function saveDraft(storage: Storage, key: string, values: FormValues) {
  storage.setItem(key, JSON.stringify(values));
}

/** The saved draft, or null if there is none or it can't be read. */
export function readDraft(storage: Storage, key: string): FormValues | null {
  const saved = storage.getItem(key);
  if (!saved) return null;
  try {
    const draft = JSON.parse(saved) as FormValues;
    return {
      ...draft,
      // JSON turns the date into a string.
      date: new Date(draft.date),
      // Drafts saved before day winners existed have no such key.
      dayWinners: draft.dayWinners ?? [],
    };
  } catch (error) {
    console.error("Error restoring form data:", error);
    return null;
  }
}
