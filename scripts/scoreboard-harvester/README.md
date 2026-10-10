# Scoreboard Harvester

Turns RDC stream VODs into **draft sessions**. It finds every end-of-match scoreboard in a video, reads the stats with the same Azure models the admin "RDC Vision" button uses, groups the matches into sets, and saves the result as an **unapproved** session. An admin reviews, edits, and approves it at `/admin/submissions`, so nothing reaches public pages without a human check.

```text
Google Sheet "Truth" ─► yt-dlp (video only) ─► ffmpeg keyframes ─► OCR keyword gate ─► dedup
   (uploads not yet in DB)                                         (RapidOCR / Apple Vision)
        ─► Azure Document Intelligence (per-game model) ─► game processor ─► sets ─► unapproved session
```

It runs on a Raspberry Pi 5, Linux, or macOS. The weekly job is a single command you put on a timer.

## Run it every week (Raspberry Pi / Linux)

One-time setup:

```bash
sudo apt install ffmpeg                       # usually already present
pip install --user --break-system-packages yt-dlp rapidocr onnxruntime
pnpm install --frozen-lockfile
```

Create `.env.harvester.local` in the repo root (gitignored):

```bash
DATABASE_URL=...                       # the DB drafts are saved to (production)
DOCUMENT_INTELLIGENCE_ENDPOINT=...     # same values as the app
DOCUMENT_INTELLIGENCE_API_KEY=...
SHEET_ID=...                           # same values as the /api/sheets cron
GCP_SA_KEY=...                         # base64 service-account JSON
# Optional: email the run report
RESEND_API_KEY=...
HARVEST_REPORT_TO=you@example.com;someone@example.com
```

Try a dry run first. Without `--write` it only writes `draft.json` files, no database rows:

```bash
pnpm exec tsx --env-file=.env.harvester.local scripts/scoreboard-harvester/index.ts weekly --limit 1
```

`pnpm harvest:weekly` is what the timer runs. It is the same command with `--write`.

Install the systemd user timer (Mondays 03:00; catches up after downtime):

```bash
mkdir -p ~/.config/systemd/user
cp scripts/scoreboard-harvester/schedule/rdc-harvester.{service,timer} ~/.config/systemd/user/
# Edit ExecStart in the .service if the repo isn't at ~/Developer/Project-RDC
systemctl --user daemon-reload
systemctl --user enable --now rdc-harvester.timer
sudo loginctl enable-linger "$USER"    # run even when nobody is logged in

systemctl --user list-timers rdc-harvester.timer   # next run
systemctl --user start rdc-harvester.service       # run now
journalctl --user -u rdc-harvester -f              # watch it
```

Runs write logs to `~/.cache/rdc-harvester/logs/` and a Markdown report to `~/.cache/rdc-harvester/reports/<date>.md`.

On macOS, point a launchd agent (`StartCalendarInterval`) at `schedule/run-weekly.sh` instead. It picks Apple Vision OCR automatically once `pnpm harvest:build-ocr` has been run.

### What the weekly job does

1. Reads the **Truth** sheet and queues rows where `added_to_db` is not TRUE and the `games` cell names a game with an Azure model (`Rocket League`, `RL`, …). Newest first.
2. Skips any (game, video) that already has a session, draft or approved. It also skips anything `weekly-state.json` says is done. Failures retry on the next run, up to 3 times (use `--retry` to force).
3. Processes at most `--limit` videos (default 4). Each takes about 20–40 minutes on a Pi 5.
4. For each video: downloads it, harvests the scoreboards, reads them with Azure, and builds the draft. With `--write` it saves an unapproved session (`createdBy: scoreboard-harvester`), then deletes the ~2 GB video.
5. Writes a report listing what was drafted, which scoreboards were skipped and why, and what to double-check. If configured, it also emails the report.

A lock file stops overlapping runs. Every stage is resumable from disk.

### Reviewing drafts

Drafts show up as **Pending** in `/admin/submissions`. Open one, compare it against the video, fix anything with **Edit**, then **Approve**. The report flags what most often needs attention:

- **Low-confidence reads** (the Azure processor's "check" flag).
- **Short sets**: a set that ended before a team reached 3 wins usually means a missed scoreboard or a misread gamertag.
- **Skipped scoreboards**: Azure failed, fewer than 2 RDC members were recognized (randoms-only lobby), or it was the same scoreboard twice.

Unknown gamertags are dropped: the processors map gamertags to members via `PLAYER_MAPPINGS`. When a member plays on a new account, add the tag there and rerun with `--retry`.

## How detection works

1. **Sample.** Keyframe mode (RL default) decodes only the video's I-frames, about one every 2–7s. On a Pi 5 that is ~15s for a 100-minute VOD, versus ~25 minutes for 1 fps. `fps` mode samples at a fixed rate for games whose results screen is brief.
2. **OCR gate.** Each frame goes through a persistent OCR daemon: RapidOCR on Linux, Apple Vision on macOS. Both speak the same line protocol. A frame is a scoreboard when at least `minKeywords` of the game's keywords appear as **standalone OCR lines**. Stream VODs carry a live-chat overlay full of "score", "mvp", "goals", so substring matching gives false positives (see `pipeline/keywords.ts`). Games can also require an end-screen sentinel. RL requires `WINNER` or `NEXT MATCH IN`, which rejects the mid-game TAB scoreboard.
3. **Skip-ahead.** After a scoreboard run ends, frames until `minMatchIntervalSec` later are skipped, since no match is that short.
4. **Dedup.** Confirmed frames within `--dedup-gap` seconds form one match. The sharpest frame from the middle of the run is saved as `match-NN_t=<hh-mm-ss>.png`.
5. **Analyze** (`--analyze`, always on for `weekly`). Each PNG goes through `analyzeScoreboard` (`src/lib/vision/analyze-scoreboard.ts`), the same code as the admin button, with every RDC member as the candidate roster. Results are cached as `match-NN.analysis.json`.
6. **Draft** (`draft/build-draft.ts`). Matches are kept in video order and grouped by the game's `setRule`: RL is first-to-3 series that also break on roster changes, MK8 is 4-race cups, COD is one set.

pHash pre-filtering (`bootstrap` + reference image) still works for clean captures. The weekly job skips it: overlays change the whole-frame hash, so on stream VODs it rejects real scoreboards.

## Game support

| Game          | Detection profile | Azure model | Notes                                                                                                                                                       |
| ------------- | ----------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rocket League | ✅ `rocket-league` | `RDC-RL`    | Validated against a real session (see below).                                                                                                               |
| Mario Kart 8  | ❌ not yet         | `RDC-MK8`   | Results list has no column headers and shows ~5s (one keyframe). Needs `fps` sampling and a name-list detector instead of header keywords. |
| Call of Duty  | ❌ not yet         | `RDC-COD`   | Add a profile from a sample VOD (see `games/README.md`).                                                                                                    |
| Marvel Rivals | ❌ not yet         | `RDC-MR`    | Same.                                                                                                                                                        |

## Manual use

```bash
# Screenshots only
pnpm harvest -- extract --game rocket-league --url 'https://youtu.be/<id>'
# Screenshots + Azure reads (needs DOCUMENT_INTELLIGENCE_* and DATABASE_URL)
pnpm exec tsx --env-file=.env.local scripts/scoreboard-harvester/index.ts \
  extract --game rocket-league --url 'https://youtu.be/<id>' --analyze
# Draft specific videos instead of reading the sheet
pnpm exec tsx --env-file=.env.harvester.local scripts/scoreboard-harvester/index.ts \
  weekly --videos <id>,<id> --game rocket-league --write
```

Output goes to `out/<game-id>/<video-id>/`: `match-NN_*.png`, `match-NN.analysis.json`, `manifest.json`, and `draft.json` for weekly runs. Run `pnpm harvest -- --help` for every flag.

## Tuning

| Symptom                        | Fix                                                                                       |
| ------------------------------ | ----------------------------------------------------------------------------------------- |
| `yt-dlp` "Sign in to confirm"  | Run from a home connection (datacenter IPs get challenged); update yt-dlp.                |
| No matches detected            | `--ocr-min-keywords 3`, `--no-require-end-screen`, or `--sampling fps`.                   |
| False positives                | Raise `--ocr-min-keywords`; add a sentinel to the profile.                                 |
| One match split in two         | Raise `--dedup-gap` (seconds at 1 fps).                                                    |
| Skip-ahead missed a match      | `--no-skip-ahead` or lower `--skip-ahead-sec`.                                             |
| OCR too slow                   | `--ocr-concurrency` × `RAPIDOCR_THREADS` ≈ cores (default 2 × 2 on a Pi 5).                |
| Vision OCR fails on macOS      | Run from a normal terminal; sandboxed shells block `~/Library/Caches`.                    |

Every stage is resumable: `video.mp4`, `frames/` (with `keyframes.json`), and the per-match analysis cache are reused. Interrupt with ^C and rerun the same command.
