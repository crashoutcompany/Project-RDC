import { MatchManifest } from "../types";

/**
 * STUB: optional submission of harvested screenshots into the existing
 * analyzeScreenShot() server action.
 *
 * NOTE: analyzeScreenShot lives in src/app/actions/visionAction.ts and depends
 * on Next.js runtime helpers (after() from next/server, PostHog server
 * analytics, etc.) that don't load cleanly from a bare tsx script. Wiring this
 * up safely requires either:
 *   (a) refactoring analyzeScreenShot to make the Next.js coupling optional, or
 *   (b) standing up a small local HTTP route the script can POST to.
 *
 * For now we leave the field as null in the manifest so users can submit
 * through the existing admin UI by dragging the PNGs in. The pipeline is
 * complete without this step.
 *
 * @param matches - Match manifest entries from dedupAndSave.
 * @param sessionId - Active session ID for the admin submission.
 * @returns The same manifests, possibly with `submission` populated.
 */
export async function submitMatches(
  matches: MatchManifest[],
  sessionId: number,
): Promise<MatchManifest[]> {
  console.warn(
    "[submit] --submit is not yet wired to analyzeScreenShot.",
  );
  console.warn(
    `[submit] ${matches.length} matches would be submitted to session ${sessionId}.`,
  );
  console.warn(
    "[submit] Upload the PNGs through the admin UI for now; see scripts/scoreboard-harvester/README.md.",
  );
  return matches;
}
