# Scoreboard extraction benchmark

Compares ways of turning an end-of-match scoreboard screenshot into stats — the custom Azure Document Intelligence models we use today against general-purpose vision LLMs — plus two ways of finding scoreboards in a video. The goal is to pick the approach for current **and future** games. The experiment design (hypotheses, controls, decision rules) is in `~/ocrbench/test-plan.md`.

## What's compared

| Job | Methods |
|---|---|
| Read stats from a scoreboard | `azure` (production), `claude-haiku-5-5`, `claude-sonnet-5-5`, `claude-opus-5-5`, `gpt-6-luna`, `gpt-6-sol`, `gemini-2.5-flash`, `gemini-3.8-flash` |
| Find scoreboards in a video | `rapidocr` (production harvester gate), `decisions` (OpenAI Decisions predicate per keyframe) |

`oracle` returns the database answer. It isn't a contender: it proves the scorer gives 100% to a perfect reading, and runs with no keys.

## Equal footing

- **Same input:** every method reads the same frozen PNGs.
- **Same instructions:** every LLM gets the same system prompt, user prompt, and JSON schema, generated from the game spec in `games.ts`. The run records a fingerprint of all three (`prompt.txt`, `run.json`).
- **Same reasoning level:** "low" effort on every provider. Claude: `effort: "low"` (thinking can't be turned off on Opus 5.5). OpenAI: `reasoning.effort: "low"`. Gemini 3.x: `thinkingLevel: "low"`. Gemini 2.5 has no levels, so it gets a 1,024-token budget.
- **No silent retries:** SDK retries are off (`maxRetries: 0`), so latency is one attempt. Failed calls are logged; `--retry-failed` reruns them.
- **No model substitution:** Claude's server-side refusal fallback is off, because it would answer with a different model. A refusal counts as a failed call.
- **Fair ordering:** calls run one at a time, ordered repeat → scoreboard → method, so methods interleave instead of each getting its own time window.
- **Same scorer:** every output is normalized to one shape (`normalize.ts`) and scored by the same code (`score.ts`).

Azure gets no prompt or gamertag list: it's the production path, called exactly as the admin "RDC Vision" button calls it.

## Datasets

| Dataset | Game | Source | Scoreboards | Values |
|---|---|---|---|---|
| `rl-session33` | Rocket League | session 33, `Opw1cTW5Q68` | 13 full-screen post-match scoreboards | 390 |
| `mk8-session41` | Mario Kart 8 | session 41, `eta4OGSy9s0` | 10 race-results panels (small, top-right, partly covered by stream overlays) | 50 |

Marvel Rivals has a trained Azure model but no sessions in the database yet, so it has no dataset.

How the MK8 images were chosen: race ends were located by OCR, then the frame showing the race result ("+points" column, before the standings re-sort) was picked by eye. Each was paired by hand to the only recorded race with the same finishing order. The map is in the dataset's `pairing` field and build log.

## Setup

Put keys in a gitignored env file at the repo root, e.g. `.env.bench.local`:

```bash
ANTHROPIC_API_KEY=...
OPENAI_API_KEY=...
GOOGLE_GENERATIVE_AI_API_KEY=...
DOCUMENT_INTELLIGENCE_ENDPOINT=...
DOCUMENT_INTELLIGENCE_API_KEY=...
DATABASE_URL=...            # only for building datasets
```

Check which methods are ready:

```bash
pnpm exec tsx --env-file=.env.bench.local scripts/extraction-benchmark/index.ts methods
```

Outputs go to `~/ocrbench/experiment` (override with `BENCH_DIR`).

## Run everything

Once keys are in `.env.bench.local`:

```bash
scripts/extraction-benchmark/run-all.sh
```

This runs every stat reader on both datasets (3 passes), writes the cross-game summary (`runs/combined.md`), and runs the finder test. Rerun it after an interruption to continue. The steps below are the same thing piece by piece.

## 1. Build a dataset

A dataset freezes scoreboard images plus the database's answer for each, so later database edits don't change the test.

```bash
pnpm exec tsx --env-file=.env.local scripts/extraction-benchmark/index.ts dataset \
  --name rl-session33 --game rocket-league --session 33 \
  --images ~/ocrbench/out/rocket-league/Opw1cTW5Q68
```

Images pair with database matches by best agreement with saved Azure readings (`*.analysis.json`), and the build log prints the agreement for each pair. Pass `--map match-01=585,match-02=582,...` to pair explicitly, which you'll need for any set without Azure readings.

## 2. Run the stat readers

```bash
pnpm exec tsx --env-file=.env.bench.local scripts/extraction-benchmark/index.ts run \
  --dataset ~/ocrbench/experiment/datasets/rl-session33/dataset.json --run rl-s33-main
```

- `--methods a,b` limits the run to some methods; the default is all except `oracle`.
- `--repeats N` sets the number of passes (default 3, to measure consistency).
- The run is resumable: rerun the same command after an interruption.

Each run directory holds:

| File | Contents |
|---|---|
| `calls.jsonl` | Every call: latency, tokens, cost, raw output, normalized prediction |
| `calls.csv`, `scores.csv` | Flat tables for spreadsheets |
| `results.md`, `results.json` | Summary tables, hypothesis checks, and the decision |
| `run.json`, `prompt.txt` | Models, prompt fingerprint, price date, host |

Run `report --dataset ... --run <name>` to regenerate the summary without making calls.

To compare games side by side and apply the "qualifies on every game → default for future games" rule:

```bash
pnpm exec tsx scripts/extraction-benchmark/index.ts combine --run rl-s33-main,mk8-s41-main
```

## 3. Run the finder test

```bash
pnpm exec tsx --env-file=.env.bench.local scripts/extraction-benchmark/index.ts finder \
  --dataset ~/ocrbench/experiment/datasets/rl-session33/dataset.json \
  --video 'https://www.youtube.com/watch?v=Opw1cTW5Q68'
```

Both methods see the same keyframes. A detection within ±30 s of a dataset scoreboard counts as found. Decisions is scored at thresholds 0.3, 0.5, 0.7 and 0.9 from one pass, and its calls resume if interrupted. Extra detections are listed with timestamps, because some may be real scoreboards the dataset leaves out (e.g. forfeits).

## Metrics

Per call:
- latency
- input, output and reasoning tokens (from each API's usage fields)
- cost (list prices in `config.ts`, dated `PRICES_CHECKED`)
- schema validity
- the scored result

Per method:
- correct values per pass, and accuracy with a 95% Wilson interval
- misses split into wrong value, player missing, or left null
- scoreboards where every member was found
- exact winners, and correct winning side
- invented players (mapped to a member who wasn't there)
- consistency across repeats
- mean and p95 latency, total time
- total tokens, total cost, and projected weekly cost (52 scoreboards)

## Adding a game

1. Add a `GameSpec` to `games.ts`: the on-screen stat keys from `stat-configs.ts`, team or solo, the winner rule, a one-paragraph screen description, and the finder question.
2. Build a dataset from a session that has scoreboard images and recorded stats.
3. Run. Azure is included automatically if the game has a trained model in `analyzeScoreboard`.

## Baseline note

On rl-session33, Azure read **367 of 390** values (94.1%). Earlier notes said "367/370", which only counted players Azure returned. It missed one player row on 4 of 13 scoreboards, because card titles like "HAPPY CAMPER" confused its row segmentation. The decision rules compare LLMs against Azure measured in the same run.
