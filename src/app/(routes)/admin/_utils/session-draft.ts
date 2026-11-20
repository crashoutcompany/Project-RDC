import type { FormValues } from "./form-helpers";

export type SessionFormMode = "create" | "edit";

/**
 * An unfinished form and the values it was started from. `base` is what the
 * form held before the admin touched it, so the draft's own changes can be
 * told apart from everything that was merely there when it was saved. It is
 * null for drafts saved before bases were kept.
 */
export type SessionDraft = { values: FormValues; base: FormValues | null };

/**
 * Where an unfinished form is kept between page loads. Each edited session
 * has its own draft, so a draft is only ever offered back to the form it
 * came from.
 */
export const draftKey = (mode: SessionFormMode, sessionId?: number) =>
  mode === "edit" ? `entryCreatorForm:edit:${sessionId}` : "entryCreatorForm";

export function saveDraft(
  storage: Storage,
  key: string,
  values: FormValues,
  base: FormValues,
) {
  storage.setItem(key, JSON.stringify({ values, base }));
}

/** JSON turns the date into a string, and old drafts lack day winners. */
const revive = (values: FormValues): FormValues => ({
  ...values,
  date: new Date(values.date),
  dayWinners: values.dayWinners ?? [],
});

/** The saved draft, or null if there is none or it can't be read. */
export function readDraft(storage: Storage, key: string): SessionDraft | null {
  const saved = storage.getItem(key);
  if (!saved) return null;
  try {
    const parsed = JSON.parse(saved);
    // Drafts saved before bases were kept are the bare form values.
    if (!("values" in parsed))
      return { values: revive(parsed as FormValues), base: null };
    const { values, base } = parsed as {
      values: FormValues;
      base?: FormValues | null;
    };
    return { values: revive(values), base: base ? revive(base) : null };
  } catch (error) {
    console.error("Error restoring form data:", error);
    return null;
  }
}

/** JSON with sorted keys, so equal values compare equal in any key order. */
function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, v) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(
          Object.entries(v).sort(([a], [b]) => (a < b ? -1 : 1)),
        )
      : v,
  );
}

const same = (a: unknown, b: unknown) => canonical(a) === canonical(b);

type SessionSet = FormValues["sets"][number];

/**
 * Lays a draft's own changes over the form as it is now.
 *
 * Restoring the draft's values wholesale would make every field the session
 * gained since (a newer approved edit) look like the admin's change, and
 * submitting would propose reverting it. So only what the admin changed
 * against the draft's base is applied: top-level fields that differ from the
 * base, and sets, matched by set id, that were changed, added or removed.
 * Everything else stays as `current`, so the form's dirty fields are exactly
 * the admin's edits.
 *
 * Where the admin and a newer edit touched the same field or set, the
 * admin's draft wins, and the form shows it for review before submitting.
 * Changes to a set that no longer exists (the session's sets were replaced
 * since) can't be placed and are counted in `dropped`.
 *
 * Returns null when the draft predates bases and the form edits an existing
 * session: there is no way to tell what the admin changed.
 */
export function applyDraft(
  current: FormValues,
  { values, base }: SessionDraft,
): { values: FormValues; dropped: number } | null {
  if (!base)
    return current.sessionId === undefined ? { values, dropped: 0 } : null;

  const merged: Record<string, unknown> = { ...current };
  for (const key of Object.keys(values) as (keyof FormValues)[])
    if (key !== "sets" && !same(values[key], base[key]))
      merged[key] = values[key];

  const baseSets = new Map(base.sets.map((set) => [set.setId, set]));
  const draftSets = new Map(values.sets.map((set) => [set.setId, set]));
  const currentIds = new Set(current.sets.map((set) => set.setId));
  let dropped = 0;

  const sets: SessionSet[] = [];
  for (const set of current.sets) {
    const before = baseSets.get(set.setId);
    const draft = draftSets.get(set.setId);
    if (before && !draft) continue; // the admin removed it
    sets.push(draft && before && !same(draft, before) ? draft : set);
  }
  for (const [setId, before] of baseSets) {
    if (currentIds.has(setId)) continue;
    const draft = draftSets.get(setId);
    if (!draft || !same(draft, before)) dropped++;
  }

  let nextId = Math.max(
    0,
    ...currentIds,
    ...baseSets.keys(),
    ...draftSets.keys(),
  );
  for (const set of values.sets)
    if (!baseSets.has(set.setId))
      sets.push(currentIds.has(set.setId) ? { ...set, setId: ++nextId } : set);

  merged.sets = sets;
  return { values: merged as FormValues, dropped };
}
