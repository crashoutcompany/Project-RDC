# Adding a new game

This harvester pipeline is game-agnostic. To support a new game, drop a profile in this folder and register it.

## 1. Create the profile

Copy `rocket-league.ts` as a template:

```ts
// games/your-game.ts
import { GameProfile } from "./types";

export const yourGame: GameProfile = {
  id: "your-game",                    // CLI slug, also the output subdir name
  displayName: "Your Game",
  keywords: [
    "FIRST", "SECOND", "TIME",        // strings Vision will reliably find
    "RECORD", "PLAYERS",              // on the end-of-match scoreboard
  ] as const,                         // used by --detector ocr (macOS only)
  endScreenSentinel: "WINNER",        // optional; powers --require-end-screen
  defaults: {
    minKeywords: 4,                   // tune via test runs
    dedupGap: 12,                     // frames; raise to merge brief animation cuts
    fps: 1,                           // 1 is usually enough for end-of-match screens
    minMatchIntervalSec: 120,         // floor for skip-ahead; min realistic gap between matches
  },
  // Used by --detector ai (the default off macOS). Plain-language, not OCR
  // keywords — describe what a human would say looking at the two screens.
  ai: {
    description:
      "The Your Game end-of-match results screen: [layout, columns, banner text].",
    reject:
      "The in-match HUD/scoreboard (similar layout, but gameplay is visible " +
      "and there's no end-of-match banner), menus, loading screens, replays.",
  },
  referenceFileName: "scoreboard.png",
  appGameId: 7, // GAME_CONFIGS id in src/lib/constants.ts; needed for --draft
};
```

### Picking keywords (OCR detector, macOS only)

- **Use column headers** ("GOALS", "TIME", "ACCURACY") — they're consistent across rounds.
- **Avoid HUD elements** that appear mid-match. If "SCORE" is on screen during gameplay, the harvester will fire on every frame.
- **Pick ≥ 5** so `minKeywords=4` can absorb one or two Vision misreads.
- **Choose a sentinel** if there's a phrase that only appears post-match ("WINNER", "MATCH COMPLETE", "FINAL RESULTS"). It powers the strictest detection mode.

### Writing the `ai` description/reject (AI detector, all platforms)

These become the prompt for `--detector ai`, so write them the way you'd describe the two screens to a person who's never seen the game:

- **`description`** — what's on screen only at the true end of a match: layout (tables? one big banner?), the columns/labels present, and anything like a "WINNER"/"VICTORY" banner or MVP badge.
- **`reject`** — the screens most likely to be confused for it. The in-match HUD/scoreboard is the classic trap, since it often shares the same columns — call out what's different (gameplay still visible, a running clock, no end-of-match banner). Also mention menus, loading screens, and replays if the game has them.
- Keep both to a sentence or two; the model sees this alongside the actual tiled frames, so it doesn't need exhaustive detail.

### Tuning `minMatchIntervalSec`

This is the floor on how long a single match (plus its post-match scoreboard plus the queue/load before the next one) takes. Set it conservatively to the **shortest realistic** gap, not the average. The harvester skips this many frames after each detection to save processing time — too aggressive and it'll skip over a real match.

- Rocket League: 180s (3 min — covers fast forfeits)
- Mario Kart races: 120s (2 min — races are 2–4 min)
- Long-format games (CoD Warzone, fighting game best-of-5): 300s+

Set to `0` to disable skip-ahead for this game.

## 2. Register the profile

Append to `games/registry.ts`:

```ts
import { yourGame } from "./your-game";

export const GAME_PROFILES: readonly GameProfile[] = [
  rocketLeague,
  yourGame,
];
```

## 3. Bootstrap a reference image

```bash
pnpm harvest -- bootstrap --game your-game --from /path/to/clean-scoreboard.png
```

Saves to `reference/<id>/<referenceFileName>`. Future `extract` runs with `--game your-game` will use it for the pHash pre-filter.

## 4. Run

```bash
pnpm harvest -- extract --game your-game --url <youtube>
```

Output lands in `out/<game-id>/<video-id>/`.

## Optional: wire to the Azure pipeline

Set `appGameId` to the numeric ID from `GAME_CONFIGS` in `src/lib/constants.ts` (the same id the admin UI uses). `--draft` needs it to pick the right stat schema and game processor; `--submit` will pick it up once the submission pathway is wired (see `pipeline/submit.ts`).
