import { GameProfile } from "./types";

/**
 * Rocket League post-match scoreboard profile.
 *
 * Keyword choice: the five column headers (SCORE, GOALS, ASSISTS, SAVES,
 * SHOTS) are always present on the RDC scoreboard layout. WINNER and MVP are
 * reliable post-match-only sentinels — they don't appear pre-match or
 * mid-match. minKeywords=4 catches a real scoreboard even if Vision drops one
 * or two tokens to OCR noise while rejecting busy mid-game HUD frames.
 *
 * Skip-ahead: a forfeit RL game can end in ~2 min, then ~30-60s of queue +
 * load before the next match's scoreboard can appear. 180s is a safe floor.
 */
export const rocketLeague: GameProfile = {
  id: "rocket-league",
  displayName: "Rocket League",
  keywords: [
    "WINNER",
    "SCORE",
    "GOALS",
    "ASSISTS",
    "SAVES",
    "SHOTS",
    "MVP",
  ] as const,
  endScreenSentinel: "WINNER",
  defaults: {
    minKeywords: 4,
    dedupGap: 12,
    fps: 1,
    minMatchIntervalSec: 180,
  },
  referenceFileName: "scoreboard.png",
};
