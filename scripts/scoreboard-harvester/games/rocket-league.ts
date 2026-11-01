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
  ai: {
    description:
      "The Rocket League end-of-match results screen: two team tables " +
      "(blue on top, orange below) with columns SCORE, GOALS, ASSISTS, SAVES, " +
      "SHOTS and one row per player, with a WINNER label above the winning " +
      "team's table or an MVP badge on one row. The tables must be visible.",
    reject:
      "The in-match TAB scoreboard (same columns, but gameplay and the match " +
      "clock are still visible and there is no WINNER label), goal replays, " +
      "the post-goal celebration, menus, loading screens, and ordinary gameplay.",
    podium:
      "The winner celebration before the stats: a large WINNER banner (e.g. " +
      '"WINNER BLUE") over the cars on a stage, with player name cards and ' +
      'awards such as "SCORER 1 Goal" or "SNIPER 219 ft Goal", but no table ' +
      "of stat columns.",
  },
  gameId: 2,
  setRule: { kind: "firstTo", wins: 3 },
  sheetAliases: ["rocket league", "rl"],
};
