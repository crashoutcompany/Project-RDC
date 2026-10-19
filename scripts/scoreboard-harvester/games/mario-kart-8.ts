import { GameProfile } from "./types";

/**
 * Mario Kart 8 results list. It stays up for only a few seconds and a stream
 * overlay often covers the first row, so the generic "is this a scoreboard?"
 * pass misses races. The finder in pipeline/mario-kart.ts samples keyframes,
 * opens a short 1 fps window where a race ends with no list in sight, and
 * reads the frame where points are being added.
 *
 * Cups are 4 races. A short last set means a results list was missed.
 */
export const marioKart8: GameProfile = {
  id: "mario-kart-8",
  displayName: "Mario Kart 8",
  keywords: ["POINTS"],
  defaults: {
    minKeywords: 1,
    dedupGap: 20,
    fps: 1,
    sampling: "keyframes",
    minMatchIntervalSec: 0,
  },
  gameId: 1,
  setRule: { kind: "fixed", size: 4 },
  sheetAliases: ["mario kart", "mario kart 8", "mk8"],
};
