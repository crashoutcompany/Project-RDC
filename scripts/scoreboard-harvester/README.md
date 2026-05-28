# Scoreboard Harvester

A local-first pipeline that scans a long video (YouTube or local file) and emits one PNG per detected end-of-match scoreboard. Built game-agnostic — Rocket League ships out of the box, more games are a config file away.

```text
Video → ffmpeg sample → pHash filter (optional) → Apple Vision OCR → dedup → match-NN.png(s) + manifest.json
```

## Quick start

```bash
# One-time setup
npm install
npm run harvest:build-ocr           # compiles the Swift Vision CLI (~5s)

# Bootstrap a reference image for Rocket League (one-time per game)
npm run harvest -- bootstrap --game rocket-league --from ~/Pictures/clean-scoreboard.png

# Extract scoreboards from a YouTube video
npm run harvest -- extract --game rocket-league --url 'https://youtu.be/<id>'

# ...or a local file
npm run harvest -- extract --game rocket-league --video ./session.mp4
```

Output goes to `out/<game-id>/<video-id>/`. For YouTube the `<video-id>` is the 11-char watch ID; for local files it's the filename minus extension.

## How detection works

1. **Sample** the video at 1 fps (configurable) into `out/<game>/<video>/frames/*.jpg` via ffmpeg with VideoToolbox hwaccel.
2. **pHash filter** (optional, when a reference exists for the active game): drop frames whose dHash differs from the reference by more than `--phash-threshold`. Massively speeds things up for clean game captures.
3. **Vision OCR** each surviving frame with the compiled Swift binary. A frame is _confirmed_ when its OCR text contains at least `--ocr-min-keywords` of the active game's keyword list.
4. **Skip-ahead**: once a confirmed run ends, jump forward `--skip-ahead-sec` seconds before resuming OCR. Per-game default; tied to the shortest possible interval between two consecutive matches.
5. **Dedup**: cluster confirmed frames whose frame-IDs are within `--dedup-gap` of each other into a single match, pick the sharpest frame from the middle of the run, save as `match-NN_t=<hh-mm-ss>.png`.
6. **Manifest**: write `manifest.json` with the game, source, config, runtime, and per-match metadata.

## Game profiles

The harvester is driven by declarative profiles in `games/`. Each profile declares the OCR keywords, end-screen sentinel, default tuning, and the reference image filename.

See **[`games/README.md`](games/README.md)** for adding a new game (three steps: drop a `.ts` file, register it, bootstrap a reference image).

Currently registered:

- `rocket-league` — keywords `WINNER SCORE GOALS ASSISTS SAVES SHOTS MVP`, sentinel `WINNER`, min-interval 180s

## CLI reference

```text
extract     Default. Harvest scoreboards.
bootstrap   Set the pHash reference image for the active --game.

--game <id>             Game profile (default: rocket-league)

--url <url>             YouTube URL
--video <path>          Local video file
--from <path>           Bootstrap-only: use an existing screenshot

--no-phash              Skip pHash; OCR every frame (use for stream videos)
--phash-threshold <n>   Hamming distance cutoff 0-64 (default: 12)
--ocr-min-keywords <n>  Min keyword hits (game-default if omitted)
--require-end-screen    Reject frames missing the game's sentinel (e.g. WINNER)
--dedup-gap <n>         Max frame gap inside one match (game-default if omitted)
--skip-ahead-sec <n>    Skip ahead this many seconds after each match
                        (game-default if omitted)
--no-skip-ahead         Disable skip-ahead

--out <dir>             Output root (default: ./out)
--fps <n>               Sample rate (game-default if omitted)
--quality <px>          Max download height (default: 720)
--sample-width <px>     Extracted frame width (default: 1280; try 960)
--jpeg-quality <n>      ffmpeg JPEG q value, lower is better (default: 3; try 5)
--ocr-concurrency <n>   Persistent OCR workers (default: 2; benchmark 1, 2, 4)
--start <sec>           Start time slice (debugging)
--end <sec>             End time slice (debugging)
--reference <path>      Override pHash reference image
--keep-frames           Don't delete temp frames after run
--submit                Pipe matches into analyzeScreenShot (stub)
--session-id <id>       Required with --submit
```

## Skip-ahead optimization

Most games have a hard floor on how long a match takes. RL is at least ~3 min including queue and load. So once the harvester confirms a scoreboard ended at frame T, the next scoreboard physically can't appear before T+180 frames (at 1 fps). The OCR loop fast-forwards past that dead zone.

State machine:

```text
After we exit a run (= dedup-gap frames since last confirm):
    skipToFrameId = lastConfirmedFrameId + skipAheadFrames
    next frames whose ID < skipToFrameId are not OCR'd
```

Tuning live in the GameProfile (`defaults.minMatchIntervalSec`). Overridable per-run with `--skip-ahead-sec <n>` or fully disabled with `--no-skip-ahead`.

Real-world impact on RDC RL videos:

| Video                  | Without skip | With skip-180 | Savings |
| ---------------------- | ------------ | ------------- | ------- |
| 2 hr, 17 matches       | 7,200 frames | ~4,140 frames | ~42%    |
| 1 hr 8 min, 10 matches | 4,103 frames | ~2,300 frames | ~44%    |

Trade-off: a noisy mid-match HUD that briefly hits the keyword threshold _and_ survives the `dedup-gap` window could cause the loop to skip past a real match. The defaults are tuned to make this very unlikely (≥ 4 unique keywords, run must end naturally), but `--no-skip-ahead` is the escape hatch.

## Performance tuning

OCR runs through persistent `vision-ocr --daemon` workers. This avoids paying Swift/Vision process startup for every frame, and `--ocr-concurrency` controls how many workers run at once. Results are still applied in frame order so skip-ahead and dedup behave like the old sequential loop.

Frame extraction now exposes the pixel and JPEG quality knobs that usually matter most for throughput. The default stays conservative (`--sample-width 1280 --jpeg-quality 3`), but Rocket League videos are good candidates for benchmarking `--sample-width 960 --jpeg-quality 5`.

Recommended slice benchmark:

```bash
npm run harvest:build-ocr

npm run harvest -- extract --game rocket-league --video ./game.mp4 \
  --out ./out/bench-c1 --start 600 --end 900 --keep-frames \
  --no-phash --ocr-concurrency 1

npm run harvest -- extract --game rocket-league --video ./game.mp4 \
  --out ./out/bench-c2 --start 600 --end 900 --keep-frames \
  --no-phash --ocr-concurrency 2

npm run harvest -- extract --game rocket-league --video ./game.mp4 \
  --out ./out/bench-c4-960 --start 600 --end 900 --keep-frames \
  --no-phash --ocr-concurrency 4 --sample-width 960 --jpeg-quality 5
```

Compare runtime plus `confirmed` and saved match counts before changing defaults for a game profile or workflow.

## Resumability

Every stage writes to disk and is skipped if its output exists:

- `out/<game>/<video>/video.mp4` is reused if already downloaded.
- `out/<game>/<video>/frames/` is reused if already extracted.

Interrupt with ^C, restart with the same args, and it picks up where it left off. Pass `--keep-frames` if you want the frames directory to survive after a successful run.

## Output: manifest.json

```json
{
  "game": "rocket-league",
  "source": { "url": "...", "filePath": "...", "durationSec": 4103, "fps": 1 },
  "config": {
    /* resolved flags incl. gameId, skipAheadFrames, etc. */
  },
  "runtimeMs": 1837886,
  "matches": [
    {
      "match": 1,
      "timestampSec": 754,
      "timestampStr": "00:12:34",
      "runLengthFrames": 11,
      "imagePath": "match-01_t=00-12-34.png",
      "ocrKeywords": ["WINNER", "GOALS", "SHOTS", "SAVES", "ASSISTS"],
      "submission": null
    }
  ]
}
```

Filenames intentionally do **not** include team scores — the local OCR pass can read the visible SCORE column (per-player points, in the hundreds) but not the actual goal totals without positional grounding. Azure Document Intelligence downstream extracts goals correctly, so the harvester just omits that field from the filename.

## Submitting to `analyzeScreenShot` (NOT YET WIRED)

`--submit` is currently a stub. `analyzeScreenShot` in `src/app/actions/visionAction.ts` depends on Next.js runtime helpers (`after()` from `next/server`, PostHog server analytics) that don't load cleanly from a bare `tsx` script. Wiring it up safely requires either:

1. Refactoring `analyzeScreenShot` to make the Next.js coupling optional, or
2. Standing up a small local HTTP endpoint the script can POST to.

When wired, the harvester will pass `GameProfile.azureGameId` automatically. For now, drag the PNGs into the existing admin upload UI manually.

## Troubleshooting

| Symptom                            | Fix                                                                                          |
| ---------------------------------- | -------------------------------------------------------------------------------------------- |
| `yt-dlp not found`                 | `brew install yt-dlp`                                                                        |
| `ffmpeg not found`                 | `brew install ffmpeg`                                                                        |
| `vision-ocr binary not built`      | `npm run harvest:build-ocr`                                                                  |
| `[phash] 0 frames survived filter` | Stream overlays make pHash unreliable. Use `--no-phash` (see below).                         |
| No matches detected                | Lower `--ocr-min-keywords` (try 3) or `--quality 1080`                                       |
| Reference image missing            | Run `bootstrap --game <id>` once, or drop your own at `reference/<id>/scoreboard.png`        |
| Too many false positives           | Raise `--ocr-min-keywords` (try 5), add `--require-end-screen`, or lower `--phash-threshold` |
| Duplicate detections close in time | Raise `--dedup-gap` (e.g. 20); per-game default is in the profile                            |
| Skip-ahead missed a match          | Use `--no-skip-ahead` or lower `--skip-ahead-sec`                                            |
| Vision OCR fails to load           | Run from a normal terminal — sandboxed shells block `~/Library/Caches` access                |

### `--no-phash`: when to use it

The pHash pre-filter is great for **clean game captures** where every frame either is or isn't a scoreboard with minimal surrounding clutter. But **YouTube stream videos** (RDC, Twitch VODs, etc.) typically have face-cam overlays, stream branding, side panels — content that varies between videos but stays consistent within one. dHash compares the whole cropped region as one fingerprint, so two scoreboards with different overlays look like completely different images.

**Solution: skip pHash and let OCR alone do the gatekeeping.**

```bash
npm run harvest -- extract --game rocket-league --video ./game.mp4 --no-phash
```

OCR is ~100ms/frame on Apple Silicon Vision, so:

- 90-min video at 1 fps = 5,400 frames = ~9 min
- 2-hour video at 1 fps = 7,200 frames = ~12 min

With skip-ahead enabled (the default), these times drop another ~40%.

### Tuning precision

If you know the expected match count and the harvester is overshooting, tighten in this order:

1. **`--require-end-screen`** — kills any frame whose OCR didn't pick up the game's sentinel keyword. Catches mid-match HUD frames and replay screens. Will also drop legit scoreboards if Vision misreads the sentinel, so spot-check the first run.
2. **`--ocr-min-keywords <n>`** — bump above the game default. Real end-of-match scoreboards usually hit all keywords; mid-match HUDs only hit a subset.
3. **`--dedup-gap <n>`** — if you're seeing the same match split into two adjacent detections, raise the gap.

If you're undershooting, loosen the same knobs the other direction.
