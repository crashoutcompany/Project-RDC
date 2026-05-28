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
  ] as const,
  endScreenSentinel: "WINNER",        // optional; powers --require-end-screen
  defaults: {
    minKeywords: 4,                   // tune via test runs
    dedupGap: 12,                     // frames; raise to merge brief animation cuts
    fps: 1,                           // 1 is usually enough for end-of-match screens
    minMatchIntervalSec: 120,         // floor for skip-ahead; min realistic gap between matches
  },
  referenceFileName: "scoreboard.png",
};
```

### Picking keywords

- **Use column headers** ("GOALS", "TIME", "ACCURACY") — they're consistent across rounds.
- **Avoid HUD elements** that appear mid-match. If "SCORE" is on screen during gameplay, the harvester will fire on every frame.
- **Pick ≥ 5** so `minKeywords=4` can absorb one or two Vision misreads.
- **Choose a sentinel** if there's a phrase that only appears post-match ("WINNER", "MATCH COMPLETE", "FINAL RESULTS"). It powers the strictest detection mode.

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
npm run harvest -- bootstrap --game your-game --from /path/to/clean-scoreboard.png
```

Saves to `reference/<id>/<referenceFileName>`. Future `extract` runs with `--game your-game` will use it for the pHash pre-filter.

## 4. Run

```bash
npm run harvest -- extract --game your-game --url <youtube>
```

Output lands in `out/<game-id>/<video-id>/`.

## Optional: wire to the Azure pipeline

Set `azureGameId` to the numeric ID your project's `analyzeScreenShot` expects. The `--submit` flag will pick it up once the submission pathway is wired (see `pipeline/submit.ts`).
