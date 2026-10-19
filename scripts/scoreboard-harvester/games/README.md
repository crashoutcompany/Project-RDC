# Adding a new game

The harvester pipeline is game-agnostic. To support a new game, drop a profile in this folder and register it.

## 1. Look at a real VOD first

Download one session and dump its keyframes. Find the end-of-match screen and note how long it stays up:

```bash
yt-dlp -f 'bv*[height<=720]' -o sample.mp4 'https://youtu.be/<id>'
mkdir kf && ffmpeg -skip_frame nokey -i sample.mp4 -fps_mode passthrough -vf scale=1280:-2 kf/%06d.jpg
```

If the scoreboard is visible across several keyframes (Rocket League's stays up for the whole "NEXT MATCH IN 60" countdown), use `sampling: "keyframes"`. Mario Kart's results list is often up for only a few seconds and a stream overlay covers rows, so it does not use this generic pass. Its finder is `pipeline/mario-kart.ts`: keyframes, then a short 1 fps window where a race ends with no list in sight.

## 2. Create the profile

Copy `rocket-league.ts` as a template:

```ts
// games/your-game.ts
import { GameProfile } from "./types";

export const yourGame: GameProfile = {
  id: "your-game", // CLI slug, also the output subdir name
  displayName: "Your Game", // also matched against the sheet's games column
  keywords: ["KILLS", "DEATHS", "ASSISTS", "SCORE", "TIME"] as const,
  keywordNoise: ["PING"], // words that may share a merged header line
  endScreenSentinels: ["VICTORY", "DEFEAT"], // post-match-only phrases
  defaults: {
    minKeywords: 4,
    requireEndScreen: true,
    dedupGap: 20, // seconds (frames at 1 fps) between frames of one scoreboard
    fps: 1,
    sampling: "keyframes",
    minMatchIntervalSec: 120, // skip-ahead floor; shortest realistic match
  },
  ai: { // optional; only for --finder ai (see below)
    description: "The Your Game end-of-match results screen: [layout, columns, banner text].",
    reject: "The in-match scoreboard (gameplay still visible), menus, loading screens, replays.",
  },
  gameId: 3, // games.game_id; picks the Gemini/Decisions spec, Azure model and processor
  setRule: { kind: "single" }, // or { kind: "firstTo", wins: 3 } / { kind: "fixed", size: 4 }
  sheetAliases: ["your game", "yg"],
};
```

### Picking keywords

- **Use column headers** ("GOALS", "KILLS", "ACCURACY"). Each must be its own OCR box. A keyword counts only when an OCR line is that word (see `pipeline/keywords.ts`), so chat-overlay sentences never match.
- **Avoid HUD elements** that appear mid-match. If an in-game TAB scoreboard shares the headers, add a sentinel and set `requireEndScreen: true`.
- **Pick ≥ 5** so `minKeywords: 4` can absorb an OCR miss.
- **Sentinels** may be phrases. A short numeric tail is tolerated ("NEXT MATCH IN 53").

### Writing the `ai` block (optional, for `--finder ai`)

`--finder ai` asks a vision model to classify tiled contact sheets of frames, so it needs plain-language descriptions instead of OCR keywords. Write them the way you'd describe the two screens to someone who has never seen the game:

- **`description`**: what is on screen only at the true end of a match. The layout (tables? one banner?), the columns and labels, and any WINNER/VICTORY banner or MVP badge.
- **`reject`**: the screens most likely to be confused with it. The in-match scoreboard is the classic trap, since it often shares the columns. Say what differs (gameplay still visible, a running clock, no end-of-match banner), and mention menus, loading screens and replays.
- Keep both to a sentence or two. The model sees them next to the actual frames.

A game without an `ai` block works with every other finder; `--finder ai` refuses it with a clear error.

### Tuning `minMatchIntervalSec`

This is the floor on how long one match takes, including its post-match screen and the queue/load before the next one. Set it to the **shortest realistic** gap, not the average. Too aggressive and skip-ahead jumps over a real match. Set `0` to disable.

### `setRule`

How drafted matches become sets. Match it to how admins already record the game; check a few existing sessions.

## 3. Register the profile

Append it to `GAME_PROFILES` in `games/registry.ts`.

## 4. Check it on a real session

```bash
pnpm exec tsx --env-file=.env.local scripts/scoreboard-harvester/index.ts \
  extract --game your-game --url 'https://youtu.be/<id>' --analyze --keep-frames
```

Compare the saved `match-NN_*.png` files and `match-NN.analysis.json` against a session already in the database before letting the weekly job draft it.
