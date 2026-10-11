# Scoreboard Harvester

Turns RDC stream VODs into **draft sessions**. It finds every end-of-match scoreboard in a video, reads the stats with the same readers the admin "RDC Vision" button uses, groups the matches into sets, and saves the result as an **unapproved** session. An admin reviews, edits, and approves it at `/admin/submissions`, so nothing reaches public pages without a human check.

```text
Google Sheet "Truth" ─► yt-dlp (video only) ─► ffmpeg keyframes ─► finder ─► dedup
   (uploads not yet in DB)                         Decisions API (falls back to local OCR)
        ─► reader ─► game processor ─► sets ─► unapproved session
           Gemini 3.8 Flash (falls back to Azure)
```

| Step   | Default                       | Fallback, on errors                  | Flag                          |
| ------ | ----------------------------- | ------------------------------------ | ----------------------------- |
| Find   | Decisions API (`gpt-6-luna`)  | Local OCR keyword gate (RapidOCR, or Apple Vision on macOS), for the frames Decisions couldn't answer | `--finder decisions\|ocr` |
| Read   | Gemini 3.8 Flash              | Azure's per-game model               | `--reader gemini\|azure`       |

The admin form only reads (admins upload the screenshots): Gemini, falling back to Azure.

Errors are handled the same way everywhere (`src/lib/vision/api-errors.ts`). Rate limits (429), 5xx, timeouts and dropped connections are retried twice with backoff, honoring `Retry-After`. Bad keys, exhausted quota, bad requests and unusable output skip straight to the fallback. Decisions also gives up after 3 frames in a row fail, and hands the rest of the video to local OCR.

`--batch` is for bulk runs. Gemini reads every scoreboard in the run through its Batch API: half price, no minimum size, usually minutes but up to 24 h. Scoreboards the batch can't answer are read the normal way, fallback included. Decisions has no batch API, so `--batch` just raises its concurrency from 4 to 12.

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
GOOGLE_GENERATIVE_AI_API_KEY=...       # Gemini (reader); same as the app
OPENAI_API_KEY=...                     # Decisions API (finder)
DOCUMENT_INTELLIGENCE_ENDPOINT=...     # Azure (reader fallback); same as the app
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

1. Reads the **Truth** sheet and queues rows where `added_to_db` is not TRUE and the `games` cell names a game with a harvester profile (`Rocket League`, `RL`, …). Newest first.
2. Skips any (game, video) that already has a session, draft or approved. It also skips anything `weekly-state.json` says is done. Failures retry on the next run, up to 3 times (use `--retry` to force).
3. Processes at most `--limit` videos (default 4). Each takes about 20–40 minutes on a Pi 5.
4. For each video: downloads it, finds the scoreboards, reads them, and builds the draft. With `--write` it saves an unapproved session (`createdBy: scoreboard-harvester`), then deletes the ~2 GB video. With `--batch`, every video is harvested first, then all their scoreboards are read in one Gemini batch, then the drafts are written.
5. Writes a report listing what was drafted, which scoreboards were skipped and why, and what to double-check. If configured, it also emails the report.

A lock file stops overlapping runs. Every stage is resumable from disk.

### Reviewing drafts

Drafts show up as **Pending** in `/admin/submissions`. Open one, compare it against the video, fix anything with **Edit**, then **Approve**. The report flags what most often needs attention:

- **Low-confidence reads** (the processor's "check" flag: a value the reader couldn't read, or an Azure misread it corrected).
- **Short sets**: a set that ended before a team reached 3 wins usually means a missed scoreboard or a misread gamertag.
- **Skipped scoreboards**: every reader failed, fewer than 2 RDC members were recognized (randoms-only lobby), or it was the same scoreboard twice.

Unknown gamertags are dropped: the processors map gamertags to members via `PLAYER_MAPPINGS`. When a member plays on a new account, add the tag there and rerun with `--retry`.

## How detection works

1. **Sample.** Keyframe mode (RL default) decodes only the video's I-frames, about one every 2–7s. On a Pi 5 that is ~15s for a 100-minute VOD, versus ~25 minutes for 1 fps. `fps` mode samples at a fixed rate for games whose results screen is brief.
2. **Find.** By default each frame is one Decisions API predicate ("is this the end-of-match scoreboard?", from `src/lib/vision/scoreboard-specs.ts`), 4 at a time; a probability ≥ 0.5 is a scoreboard. Answers are logged to `decisions.jsonl`, so reruns only ask frames without one. Costs about $0.15 for a 100-minute VOD and takes about a minute.

   **Local OCR** (`--finder ocr`, and the fallback) puts each frame through a persistent OCR daemon: RapidOCR on Linux, Apple Vision on macOS. Both speak the same line protocol. A frame is a scoreboard when at least `minKeywords` of the game's keywords appear as **standalone OCR lines**. Stream VODs carry a live-chat overlay full of "score", "mvp", "goals", so substring matching gives false positives (see `pipeline/keywords.ts`). Games can also require an end-screen sentinel. RL requires `WINNER` or `NEXT MATCH IN`, which rejects the mid-game TAB scoreboard.
3. **Skip-ahead** (OCR finder only). After a scoreboard run ends, frames until `minMatchIntervalSec` later are skipped, since no match is that short.
4. **Dedup.** Confirmed frames within `--dedup-gap` seconds form one match. The earliest frame of the run is saved as `match-NN_t=<hh-mm-ss>.png`: players who leave during the countdown disappear from the scoreboard, so later frames can be missing rows.
5. **Read** (on by default; `--no-analyze` stops after the screenshots). Each PNG goes through the reader chain in `src/lib/vision/readers.ts`, the same code as the admin button, with every RDC member as the candidate roster. Gemini's answer is put in Azure's field layout and run through the same game processor, minus Azure-specific misread fixes. Results are cached as `match-NN.analysis.json`, with the reader that produced them and any fallbacks.
6. **Draft** (`draft/build-draft.ts`). Matches are kept in video order and grouped by the game's `setRule`: RL is first-to-3 series that also break on roster changes, MK8 is 4-race cups, COD is one set.

## Validation

### Decisions + Gemini (current default)

Extraction benchmark (branch `exp/extraction-benchmark`), 2026-10-10, against the stats stored in the database:

| Session | Matches in DB | Decisions found | Gemini values right (3 passes) | Winners | Invented players | Cost / scoreboard |
| ------- | ------------- | --------------- | ------------------------------ | ------- | ---------------- | ----------------- |
| RL 33   | 13 shown      | 13, 0 false positives | 100% (390/390)            | 13/13   | 0                | ~$0.003           |
| RL 1    | 21            | 21              | 99.7% (628/630 per pass)       | 21/21   | 0                | $0.0028           |
| RL 2    | 17            | 17              | 100% (510/510)                 | 17/17   | 0                | $0.0028           |
| RL 13   | 12            | 12              | 100% (360/360)                 | 12/12   | 0                | $0.0027           |

On the same RL 33 frames, RapidOCR took ~30 min to find the scoreboards and Decisions ~1.3 min. Azure read 94.1% of RL 33's values (it drops a row when a card title like "HAPPY CAMPER" appears) and 72% on an MK8 sample.

### RapidOCR + Azure (original pipeline)

Checked against session 33 (`Opw1cTW5Q68`, "BENCH PLAYERS TALKING LIKE STARTERS", 1h43m, 15 recorded RL matches) on a Raspberry Pi 5:

| Stage            | Result                                                                                                                                                                  |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Runtime          | 31 min end to end: 15s keyframe decode (1,357 frames), ~29 min OCR with skip-ahead, ~1 min Azure                                                                        |
| Detection        | 13 scoreboards, 0 false positives. The 2 recorded matches not found have no end screen in the VOD: most players are all-zero, which looks like a restart or forfeit      |
| Stats            | **367 / 370** stat values match the database. All 3 misses are in one row where Azure merged a player-card subtitle ("HAPPY CAMPER"); that match is flagged for review |
| Players          | 6/6 recognized in 9 matches, 5/6 in 4 (an unreadable row is dropped and flagged)                                                                                        |

Fixed along the way, in the shared processor code the admin button also uses:

- The RL model labels Orange fields `RL_Goals` but Blue fields `Goals`. Blue stats came back as `UNKNOWN_STAT`, and winners were computed from Orange's goals alone.
- An unrecognized gamertag row crashed the whole analysis ("Cannot read properties of undefined (reading 'map')").
- Merged cells (`"140\n38"`) were stored verbatim.

## Game support

A game needs a harvester profile (`games/`) to be found in videos, and a scoreboard spec (`src/lib/vision/scoreboard-specs.ts`) to be read by Gemini or found by Decisions. Without a spec, both fall back (to Azure and local OCR).

| Game          | Harvester profile | Gemini / Decisions spec | Azure model | Notes                                                                                                                       |
| ------------- | ----------------- | ----------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------- |
| Rocket League | ✅ `rocket-league` | ✅                       | `RDC-RL`    | Validated (see above).                                                                                                      |
| Mario Kart 8  | ❌ not yet         | ✅                       | `RDC-MK8`   | Screenshots in the admin form work. Videos need 1 fps sampling: the results panel shows ~5s, and keyframe sampling found 21 of 37 races. |
| Call of Duty  | ❌ not yet         | ❌                       | `RDC-COD`   | Add a profile from a sample VOD (see `games/README.md`) and a spec.                                                          |
| Marvel Rivals | ❌ not yet         | ❌                       | `RDC-MR`    | Same. No sessions in the database yet to validate against.                                                                  |

## Manual use

```bash
# Find + read one video: Decisions + Gemini (needs the keys above and DATABASE_URL)
pnpm exec tsx --env-file=.env.harvester.local scripts/scoreboard-harvester/index.ts \
  extract --game rocket-league --url 'https://youtu.be/<id>'
# The original setup
  ... extract --game rocket-league --url 'https://youtu.be/<id>' --finder ocr --reader azure
# Screenshots only
  ... extract --game rocket-league --url 'https://youtu.be/<id>' --no-analyze
# Bulk: draft many videos, reading every scoreboard in one Gemini batch
pnpm exec tsx --env-file=.env.harvester.local scripts/scoreboard-harvester/index.ts \
  weekly --limit 50 --batch --write
# Draft specific videos instead of reading the sheet
pnpm exec tsx --env-file=.env.harvester.local scripts/scoreboard-harvester/index.ts \
  weekly --videos <id>,<id> --game rocket-league --write
```

Output goes to `out/<game-id>/<video-id>/`: `match-NN_*.png`, `match-NN.analysis.json`, `manifest.json`, and `draft.json` for weekly runs. Run `pnpm harvest -- --help` for every flag.

## Tuning

| Symptom                        | Fix                                                                                       |
| ------------------------------ | ----------------------------------------------------------------------------------------- |
| `yt-dlp` "Sign in to confirm"  | Run from a home connection (datacenter IPs get challenged); update yt-dlp.                |
| No matches detected            | `--sampling fps`; with `--finder ocr` also `--ocr-min-keywords 3` or `--no-require-end-screen`. |
| Decisions keeps falling back   | Check `OPENAI_API_KEY` and quota; the reason is in the log and `manifest.json` (`finder`). |
| Gemini keeps falling back      | Check `GOOGLE_GENERATIVE_AI_API_KEY`; each match's `reader.fallbacks` says why.           |
| False positives                | Raise `--ocr-min-keywords`; add a sentinel to the profile.                                 |
| One match split in two         | Raise `--dedup-gap` (seconds at 1 fps).                                                    |
| Skip-ahead missed a match      | `--no-skip-ahead` or lower `--skip-ahead-sec`.                                             |
| OCR too slow                   | `--ocr-concurrency` × `RAPIDOCR_THREADS` ≈ cores (default 2 × 2 on a Pi 5).                |
| Vision OCR fails on macOS      | Run from a normal terminal; sandboxed shells block `~/Library/Caches`.                    |

Every stage is resumable: `video.mp4`, `frames/` (with `keyframes.json`), and the per-match analysis cache are reused. Interrupt with ^C and rerun the same command.
