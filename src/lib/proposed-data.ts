import type { ProposedData } from "@/app/actions/editSession";

/**
 * Read a SessionEditRequest.proposedData value. New rows store the object in
 * the Json column; older rows stored a JSON string inside it.
 */
export function parseProposedData(raw: unknown): ProposedData {
  return (typeof raw === "string" ? JSON.parse(raw) : raw) as ProposedData;
}

/**
 * Whether a react-hook-form `dirtyFields` value marks a real change. After any
 * field-array operation the form reports the whole tree with `false` leaves,
 * so an untouched `sets` is a truthy array; only a `true` leaf is a change.
 */
export function hasChanges(dirty: unknown): boolean {
  if (dirty === true) return true;
  if (typeof dirty !== "object" || dirty === null) return false;
  return Object.values(dirty).some(hasChanges);
}
