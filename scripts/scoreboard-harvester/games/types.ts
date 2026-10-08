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
   * OCR strings the scoreboard reliably contains. The harvester counts how
   * many of these appear (case-insensitive substring match) and confirms a
   * frame when the count meets `defaults.minKeywords`.
   *
   * Choose words that are exclusive to the post-match screen — column headers
   * usually work well (GOALS, ASSISTS, SAVES), but avoid HUD elements that
   * appear during gameplay.
   */
  keywords: readonly string[];
  /**
   * Optional sentinel that marks a frame as definitively post-match (e.g.,
   * "WINNER"). When the user passes --require-end-screen, frames missing this
   * keyword are rejected even if they hit the keyword count threshold.
   */
  endScreenSentinel?: string;
  defaults: {
    /** Minimum keyword hits to confirm a frame. */
    minKeywords: number;
    /** Max frame gap inside a single detected match. */
    dedupGap: number;
    /** Frame sampling rate. 1 fps is plenty for end-of-match scoreboards. */
    fps: number;
    /**
     * Minimum wall-clock seconds between two consecutive end-of-match
     * scoreboards. Used by the skip-ahead optimization: after a confirmed run
     * ends, the OCR loop jumps `minMatchIntervalSec * fps` frames forward.
     *
     * Set this conservatively to the SHORTEST realistic gap between matches
     * (game length + queue/load floor), not the average. Set to 0 to disable
     * skip-ahead by default for this game.
     */
    minMatchIntervalSec: number;
  };
  /**
   * Plain-language descriptions for the AI detector's prompt. Describe what
   * the post-match screen looks like, and what near-misses to reject — the
   * in-match scoreboard is the usual trap, since it shares the same columns.
   */
  ai: {
    /** What the end-of-match scoreboard looks like. */
    description: string;
    /** Screens that look similar but must NOT count. */
    reject: string;
  };
  /** Filename inside `reference/<id>/` to use as the pHash reference image. */
  referenceFileName: string;
  /**
   * The app's numeric game ID (`GAME_CONFIGS` in src/lib/constants.ts). Needed
   * by --draft to pick the stat schema and game processor.
   */
  appGameId?: number;
}
