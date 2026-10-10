import { GameProfile } from "./types";

/**
 * Rocket League post-match scoreboard profile.
 *
 * Keyword choice: the five column headers (SCORE, GOALS, ASSISTS, SAVES,
 * SHOTS) are always present on the RDC scoreboard layout. WINNER and MVP are
 * reliable post-match-only sentinels — they don't appear pre-match or
 * mid-match. minKeywords=4 catches a real scoreboard even if OCR drops one
 * or two tokens while rejecting busy mid-game HUD frames.
 *
 * The mid-match TAB scoreboard has the same column headers, so an end-screen
 * sentinel (WINNER above the winning team, or the NEXT MATCH IN countdown) is
 * required by default.
 *
 * The post-match screen stays up for the whole "NEXT MATCH IN 60" countdown,
 * so keyframe sampling (one I-frame every ~2–7s) can't miss it.
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
  keywordNoise: ["PING"],
  endScreenSentinels: ["WINNER", "NEXT MATCH IN"],
  defaults: {
    minKeywords: 4,
    requireEndScreen: true,
    dedupGap: 20,
    fps: 1,
    sampling: "keyframes",
    minMatchIntervalSec: 180,
  },
  referenceFileName: "scoreboard.png",
  azureGameId: 2,
  setRule: { kind: "firstTo", wins: 3 },
  sheetAliases: ["rocket league", "rl"],
};
