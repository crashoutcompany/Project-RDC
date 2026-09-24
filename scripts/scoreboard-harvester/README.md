# Scoreboard Harvester

A local-first pipeline that scans a long video (YouTube or local file) and emits one PNG per detected end-of-match scoreboard, with draft stats already extracted. Built game-agnostic and OS-agnostic — Rocket League ships out of the box, more games are a config file away.

```text
Video → ffmpeg sample → pHash filter (optional) → detector (AI or OCR) → dedup → match-NN.png(s) [+ --draft: match-NN.json] + manifest.json
```

Two detectors:

- **`--detector ai`** (works everywhere): a vision model classifies tiled contact sheets of frames. This is the default off macOS.
- **`--detector ocr`** (macOS only): Apple's on-device Vision framework, via a small compiled Swift binary. Free and fast, no API calls. `--detector auto` (the default) picks this automatically when it's built.

## Quick start

```bash
pnpm install --frozen-lockfile

# Bootstrap a reference image for Rocket League (one-time per game; speeds up
# every later run by letting the pHash pre-filter throw out most frames free)
pnpm harvest -- bootstrap --game rocket-league --from ~/Pictures/clean-scoreboard.png

# Extract scoreboards + draft stats from a YouTube video, with an AI model
pnpm harvest -- extract --game rocket-league --url 'https://youtu.be/<id>' \
  --detect-model google:gemini-2.5-flash --draft

# ...or a local file, and build a vision-eval fixture from every match found
pnpm harvest -- extract --game rocket-league --video ./session.mp4 \
  --detect-model google:gemini-2.5-flash --emit-fixtures ../vision-eval/fixtures
```

Reads model API keys from the app's own `.env`/`.env.development.local`/`.env.local`, same as `pnpm dev`.

Output goes to `out/<game-id>/<video-id>/`. For YouTube the `<video-id>` is the 11-char watch ID; for local files it's the filename minus extension.

macOS + Apple Vision instead (free, no API calls):

```bash
pnpm harvest:build-ocr               # compiles the Swift Vision CLI (~5s), macOS only
pnpm harvest -- extract --game rocket-league --video ./session.mp4 --detector ocr
```

## How detection works

1. **Sample** the video at 1 fps (configurable) into `out/<game>/<video>/frames/*.jpg` via ffmpeg. Hardware-decodes with VideoToolbox on macOS, software elsewhere unless `--hwaccel` is set.
2. **pHash filter** (optional, when a reference exists for the active game): drop frames whose dHash differs from the reference by more than `--phash-threshold`. Massively speeds things up for clean game captures; unreliable on stream captures with overlays (use `--no-phash`, see below).
3. **Detect**: the active detector confirms scoreboard frames.
   - `ai`: tiles up to `--ai-grid`² surviving frames into one contact sheet per request and asks a vision model to classify each tile, at a coarse `--ai-stride-sec` stride to bound the cost of a long video, then (unless `--no-refine`) refines every frame around each hit so dedup has a real run to pick the sharpest frame from. See "AI detector cost" below.
   - `ocr`: reads each frame with Apple Vision and confirms it when the text contains at least `--ocr-min-keywords` of the game's keyword list.
4. **Skip-ahead**: once a confirmed run ends, jump forward `--skip-ahead-sec` seconds before resuming detection. Per-game default; tied to the shortest possible interval between two consecutive matches.
5. **Dedup**: cluster confirmed frames whose frame-IDs are within `--dedup-gap` of each other into a single match, pick the sharpest frame from the middle of the run, save as `match-NN_t=<hh-mm-ss>.png`.
6. **Draft** (`--draft`, or implied by `--emit-fixtures`): run the app's real extraction pipeline (same code the vision-eval CLI scores) on each saved match, write `match-NN.json`, and optionally also write a `vision-eval` fixture (`--emit-fixtures <dir>`) with a pre-filled, clearly-marked-draft `expected.json` — turning "build 20 eval fixtures" into "correct 20 drafts" instead of "type every stat by hand". See `../vision-eval/README.md`.
7. **Manifest**: write `manifest.json` with the game, source, config, runtime, and per-match metadata (including which detector/model found it, and the draft result if `--draft` ran).

## AI detector cost

A vision model call per frame would be slow and expensive on a 2-hour, 7,200-frame video. Three things bring that down, in order:

1. **Coarse stride** (`--ai-stride-sec`, default 4s): only classify every Nth second of the already-1fps sample. A scoreboard sits on screen well longer than the stride, so it's never missed — the CLI refuses a stride longer than `--dedup-gap` for exactly this reason.
2. **Contact sheets** (`--ai-grid`, default 3, i.e. up to 9 frames/request): tiles several frames into one numbered image, so one model call classifies many frames. Use `--ai-grid 2` for small/local models that struggle to track more tiles at once; `--ai-grid 1` disables tiling.
3. **Skip-ahead** (as above) on top of both.

Rough numbers for a 2-hour Rocket League video: ~1,800 coarse frames → ~1,050 after skip-ahead → ~120 contact-sheet calls, plus a short refine pass per confirmed match (a handful more calls). With Gemini Flash that's cents and a few minutes; a local 7B model is fine on a GPU but slow on CPU — use `--start`/`--end` to tune on a slice first.

Every classified frame is cached by content hash in `out/<game>/<video>/detections.jsonl`, so re-running the same video with the same detector/model/grid makes **zero** additional model calls — only new or changed settings cost anything.

## Game profiles

The harvester is driven by declarative profiles in `games/`. Each profile declares the keywords (OCR), the AI description/reject text, end-screen sentinel, default tuning, and the reference image filename.

See **[`games/README.md`](games/README.md)** for adding a new game (three steps: drop a `.ts` file, register it, bootstrap a reference image).

Currently registered:

- `rocket-league` — keywords `WINNER SCORE GOALS ASSISTS SAVES SHOTS MVP`, sentinel `WINNER`, min-interval 180s, `appGameId: 2`

## CLI reference

```text
extract     Default. Harvest scoreboards (+ optionally draft stats).
bootstrap   Set the pHash reference image for the active --game.

--game <id>             Game profile (default: rocket-league)

--url <url>             YouTube URL
--video <path>          Local video file
--from <path>           Bootstrap-only: use an existing screenshot

Detector:
--detector <kind>       auto (default) | ai | ocr. auto uses ocr on macOS
                        when the vision-ocr binary is built, else ai
--detect-model <spec>   AI model, <provider>:<model> — e.g.
                        google:gemini-2.5-flash, local:qwen2.5vl:7b,
                        azure:<deployment>. Default: $HARVEST_DETECT_MODEL,
                        then $VISION_MODEL, then google:gemini-2.5-flash
--detect-concurrency <n>  Classifier calls in flight (default: 2; alias --ocr-concurrency)
--ai-stride-sec <n>     AI coarse pass: classify one frame every n seconds
                        (default: 4; must be <= dedup-gap / fps)
--ai-grid <n>           AI: frames per request = n×n contact sheet
                        (default: 3; try 2 for small local models, 1 to disable)
--ai-min-confidence <n> AI: min confidence for a post-match verdict (default: 0.6)
--no-refine             AI: skip re-checking every frame around coarse hits
--ocr-min-keywords <n>  OCR: min keyword hits (game-default if omitted)
--require-end-screen    OCR: reject frames missing the game's sentinel (e.g. WINNER)

Draft stats:
--draft                 Run extraction on each saved match; writes match-NN.json
--extract-model <spec>  Model for --draft (default: the detect model)
--players <a,b,...>     Session roster for --draft (default: every RDC member)
--emit-fixtures <dir>   Also write vision-eval fixtures (implies --draft)

--no-phash              Skip pHash; classify every frame (use for stream videos)
--phash-threshold <n>   Hamming distance cutoff 0-64 (default: 12)
--dedup-gap <n>         Max frame gap inside one match (game-default if omitted)
--skip-ahead-sec <n>    Skip ahead this many seconds after each match
                        (game-default if omitted)
--no-skip-ahead         Disable skip-ahead

--out <dir>             Output root (default: ./out)
--fps <n>               Sample rate (game-default if omitted)
--quality <px>          Max download height (default: 720)
--sample-width <px>     Extracted frame width (default: 1280; try 960)
--jpeg-quality <n>      ffmpeg JPEG q value, lower is better (default: 3; try 5)
--hwaccel <name>        ffmpeg -hwaccel for frame extraction (default:
                        videotoolbox on macOS, none elsewhere; e.g. cuda, vaapi)
--start <sec>           Start time slice (debugging)
--end <sec>             End time slice (debugging)
--reference <path>      Override pHash reference image
--keep-frames           Don't delete temp frames after run (also keeps AI
                        contact sheets under out/<game>/<video>/sheets/)
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

Tuning live in the GameProfile (`defaults.minMatchIntervalSec`). Overridable per-run with `--skip-ahead-sec <n>` or fully disabled with `--no-skip-ahead`. Applies to both detectors.

Real-world impact on RDC RL videos:

| Video                  | Without skip | With skip-180 | Savings |
| ---------------------- | ------------ | ------------- | ------- |
| 2 hr, 17 matches       | 7,200 frames | ~4,140 frames | ~42%    |
| 1 hr 8 min, 10 matches | 4,103 frames | ~2,300 frames | ~44%    |

Trade-off: a noisy mid-match HUD that briefly hits the keyword threshold _and_ survives the `dedup-gap` window could cause the loop to skip past a real match. The OCR defaults are tuned to make this very unlikely (≥ 4 unique keywords, run must end naturally), but `--no-skip-ahead` is the escape hatch.

## Performance tuning

Both detectors classify frames through the same batching state machine (`pipeline/detect.ts`) — `--detect-concurrency` controls how many classifier calls (OCR workers, or AI requests) run at once, and results are always applied in frame order so skip-ahead and dedup behave the same regardless of concurrency. OCR additionally runs through persistent `vision-ocr --daemon` workers, avoiding Swift/Vision process startup per frame.

Frame extraction now exposes the pixel and JPEG quality knobs that usually matter most for throughput. The default stays conservative (`--sample-width 1280 --jpeg-quality 3`), but Rocket League videos are good candidates for benchmarking `--sample-width 960 --jpeg-quality 5`.

Recommended slice benchmark:

```bash
pnpm harvest:build-ocr

pnpm harvest -- extract --game rocket-league --video ./game.mp4 \
  --out ./out/bench-c1 --start 600 --end 900 --keep-frames \
  --detector ocr --no-phash --detect-concurrency 1

pnpm harvest -- extract --game rocket-league --video ./game.mp4 \
  --out ./out/bench-c2 --start 600 --end 900 --keep-frames \
  --detector ocr --no-phash --detect-concurrency 2

pnpm harvest -- extract --game rocket-league --video ./game.mp4 \
  --out ./out/bench-c4-960 --start 600 --end 900 --keep-frames \
  --detector ocr --no-phash --detect-concurrency 4 --sample-width 960 --jpeg-quality 5
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
      "detection": {
        "detector": "ai",
        "model": "google:gemini-2.5-flash",
        "evidence": ["post-match@0.94"],
        "confidence": 0.94
      },
      "draft": {
        "model": "google:gemini-2.5-flash",
        "status": "Success",
        "draftPath": "match-01.json",
        "players": [{ "name": "Mark", "stats": [{ "stat": "RL_GOALS", "statValue": "3" }] }],
        "winners": ["Mark"]
      },
      "submission": null
    }
  ]
}
```

`ocrKeywords` is only populated for OCR-detected matches; `detection.evidence` is the detector-neutral field and is always populated. `draft` is only present when `--draft` (or `--emit-fixtures`) ran.

Filenames intentionally do **not** include team scores — neither detector reads exact goal totals from raw pixels without positional grounding, so the harvester omits that field from the filename. `--draft` gets the real per-player values through the app's own extraction pipeline instead (see `match-NN.json`).

## Submitting to `analyzeScreenShot` (NOT YET WIRED)

`--submit` is currently a stub, separate from `--draft`. `--draft` runs the same extraction the app uses and writes the result to disk (`match-NN.json`) and, optionally, a `vision-eval` fixture — but it does not touch the database. Actually creating a session record still means dragging the PNGs into the existing admin upload UI, or waiting for `--submit` to be wired up (see `pipeline/submit.ts`).

When wired, the harvester will pass `GameProfile.appGameId` automatically — the same id `--draft` already uses.

## Troubleshooting

| Symptom                            | Fix                                                                                          |
| ---------------------------------- | -------------------------------------------------------------------------------------------- |
| `yt-dlp not found`                 | `pipx install yt-dlp` (Linux/Windows) or `brew install yt-dlp` (macOS)                       |
| `ffmpeg not found`                 | Your platform's package manager (`apt`/`dnf`/`pacman`/`winget`/`brew`) — see the error's hint |
| `--detector ocr` errors on Linux/Windows | It's macOS-only; use `--detector ai` (or leave `--detector auto`)                       |
| `vision-ocr binary not built`      | `pnpm harvest:build-ocr` (macOS only)                                                         |
| `[phash] 0 frames survived filter` | Stream overlays make pHash unreliable. Use `--no-phash` (see below).                         |
| No matches detected (AI)           | Lower `--ai-min-confidence` (try 0.4), raise `--ai-stride-sec` down (try 2), or `--quality 1080` |
| No matches detected (OCR)          | Lower `--ocr-min-keywords` (try 3) or `--quality 1080`                                       |
| Reference image missing            | Run `bootstrap --game <id>` once, or drop your own at `reference/<id>/scoreboard.png`        |
| Too many false positives (AI)      | Raise `--ai-min-confidence` (try 0.75), or lower `--phash-threshold`                          |
| Too many false positives (OCR)     | Raise `--ocr-min-keywords` (try 5), add `--require-end-screen`, or lower `--phash-threshold` |
| Duplicate detections close in time | Raise `--dedup-gap` (e.g. 20); per-game default is in the profile                            |
| Skip-ahead missed a match          | Use `--no-skip-ahead` or lower `--skip-ahead-sec`                                            |
| `--draft` skipped with a warning   | Needs the app's Prisma client generated with typed SQL — `pnpm prisma generate --sql` with a reachable `DATABASE_URL`, plus a working `.env` |
| Vision OCR fails to load           | Run from a normal terminal — sandboxed shells block `~/Library/Caches` access                |

### `--no-phash`: when to use it

The pHash pre-filter is great for **clean game captures** where every frame either is or isn't a scoreboard with minimal surrounding clutter. But **YouTube stream videos** (RDC, Twitch VODs, etc.) typically have face-cam overlays, stream branding, side panels — content that varies between videos but stays consistent within one. dHash compares the whole cropped region as one fingerprint, so two scoreboards with different overlays look like completely different images.

**Solution: skip pHash and let the detector alone do the gatekeeping.**

```bash
pnpm harvest -- extract --game rocket-league --video ./game.mp4 --no-phash
```

OCR is ~100ms/frame on Apple Silicon Vision (90-min video ≈ 9 min, 2-hour ≈ 12 min at 1 fps, less with skip-ahead). The AI detector's coarse stride + contact sheets mean it barely notices — see "AI detector cost" above.

### Tuning precision

If you know the expected match count and the harvester is overshooting, tighten in this order:

**AI detector:**

1. **`--ai-min-confidence <n>`** — raise above the default (0.6). Real end-of-match screens are usually confident; borderline frames (transitions, similar-looking menus) sit lower.
2. **`--ai-grid 2` or `1`** — fewer tiles per sheet tends to sharpen classification, at the cost of more calls.
3. **`--dedup-gap <n>`** — if you're seeing the same match split into two adjacent detections, raise the gap.

**OCR detector:**

1. **`--require-end-screen`** — kills any frame whose OCR didn't pick up the game's sentinel keyword. Catches mid-match HUD frames and replay screens. Will also drop legit scoreboards if Vision misreads the sentinel, so spot-check the first run.
2. **`--ocr-min-keywords <n>`** — bump above the game default. Real end-of-match scoreboards usually hit all keywords; mid-match HUDs only hit a subset.
3. **`--dedup-gap <n>`** — same as above.

If you're undershooting, loosen the same knobs the other direction.
