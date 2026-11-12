import type { ProposedData } from "@/app/actions/editSession";

/**
 * Read a SessionEditRequest.proposedData value. New rows store the object in
 * the Json column; older rows stored a JSON string inside it.
 */
export function parseProposedData(raw: unknown): ProposedData {
  return (typeof raw === "string" ? JSON.parse(raw) : raw) as ProposedData;
}
