/**
 * How consecutive matches are grouped into sets when the harvester drafts a
 * session. Mirrors how RDC records each game today:
 *
 * - `firstTo`: team series. A new set starts when the roster changes or a team
 *   reaches `wins` match wins (Rocket League plays first-to-3).
 * - `fixed`: every `size` matches form a set (Mario Kart cups are 4 races).
 * - `single`: one set holds every match (Call of Duty lobbies).
 */
export type SetRule =
  | { kind: "firstTo"; wins: number }
  | { kind: "fixed"; size: number }
  | { kind: "single" };

/**
 * GameProfile describes everything the harvester pipeline needs to detect and
 * deduplicate end-of-match scoreboards for a specific game. Profiles are
 * declarative — there is no game-specific code in the pipeline itself; new
 * games are added by dropping a new profile into `games/` and registering it
 * in `games/registry.ts`.
 */
export interface GameProfile {
  /** Stable slug used for the --game flag, output directory, and Azure routing. */
  id: string;
  /** Human-readable name for logs and help text. */
  displayName: string;
  /**
   * OCR strings the scoreboard reliably contains. A keyword counts when an OCR
   * line is that keyword on its own (see pipeline/keywords.ts), and a frame is
   * confirmed when the count meets `defaults.minKeywords`.
   *
   * Choose words that are exclusive to the post-match screen — column headers
   * usually work well (GOALS, ASSISTS, SAVES), but avoid HUD elements that
   * appear during gameplay.
   */
  keywords: readonly string[];
  /**
   * Extra words that may share a merged OCR line with keywords without
   * disqualifying it (e.g. "PING" at the end of the RL header row).
   */
  keywordNoise?: readonly string[];
  /**
   * Phrases that mark a frame as definitively post-match (e.g. "WINNER",
   * "NEXT MATCH IN"). With require-end-screen on, a frame needs at least one.
   */
  endScreenSentinels?: readonly string[];
  defaults: {
    /** Minimum keyword hits to confirm a frame. */
    minKeywords: number;
    /** Reject frames with no end-screen sentinel unless overridden. */
    requireEndScreen?: boolean;
    /**
     * Max gap inside a single detected match, in frames at `fps` (so seconds
     * at 1 fps). Applied to timestamps, so it also works in keyframe mode.
     */
    dedupGap: number;
    /** Frame sampling rate. 1 fps is plenty for end-of-match scoreboards. */
    fps: number;
    /**
     * `keyframes` decodes only the video's I-frames (one every ~2–7s on
     * YouTube): ~100x less decoding, which matters on a Raspberry Pi. Only use
     * it for games whose scoreboard stays up well past 10s.
     */
    sampling?: "fps" | "keyframes";
    /**
     * Minimum wall-clock seconds between two consecutive end-of-match
     * scoreboards. Used by the skip-ahead optimization: after a confirmed run
     * ends, OCR resumes `minMatchIntervalSec` after the last confirmed frame.
     *
     * Set this conservatively to the SHORTEST realistic gap between matches
     * (game length + queue/load floor), not the average. Set to 0 to disable
     * skip-ahead by default for this game.
     */
    minMatchIntervalSec: number;
  };
  /** Filename inside `reference/<id>/` to use as the pHash reference image. */
  referenceFileName: string;
  /**
   * Numeric game ID (games.game_id) — routes the screenshot to the game's
   * Azure model and processor, and owns the drafted session.
   */
  azureGameId?: number;
  /** How drafted matches are grouped into sets. Defaults to `single`. */
  setRule?: SetRule;
  /**
   * Lower-case names the Google Sheet "games" column may use for this game.
   * The display name is always accepted.
   */
  sheetAliases?: readonly string[];
}
