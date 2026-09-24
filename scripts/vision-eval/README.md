# Vision provider eval

Compares screenshot-vision providers/models (Azure Document Intelligence, or
any LLM reachable through `src/lib/vision`) against a small hand-labeled set
of real scoreboard screenshots, so you can pick a model with data instead of
by eye.

## Usage

```bash
pnpm vision:eval
pnpm vision:eval --providers=azure-di,llm:google:gemini-2.5-flash
pnpm vision:eval --providers=llm:local:qwen2.5vl:7b --fixtures=./scripts/vision-eval/fixtures
```

Provider specs:

- `azure-di` — the existing Azure Document Intelligence custom models.
- `llm:google:gemini-2.5-flash` — any model id the `google` provider accepts.
- `llm:azure:<deployment-name>` — an Azure OpenAI deployment. Needs
  `AZURE_API_KEY` and `AZURE_RESOURCE_NAME` in `.env`.
- `llm:local:<model-id>` — any OpenAI-compatible server (Ollama, LM Studio,
  vLLM, llama.cpp). Needs `VISION_OPENAI_BASE_URL` (defaults to Ollama's
  `http://localhost:11434/v1`) in `.env`. **Only reachable when this script
  runs on the same machine as the model** — it cannot reach your LAN or
  localhost if run from a deployed environment.

The script reads `.env` via `dotenv`, same as the app.

## Fixture format

```
scripts/vision-eval/fixtures/
  <case-id>/
    image.png            (or .jpg / .jpeg)
    expected.json
```

`expected.json`:

```json
{
  "gameId": 2,
  "sessionPlayers": ["Mark", "Dylan"],
  "players": [
    {
      "name": "Mark",
      "stats": { "RL_SCORE": "400", "RL_GOALS": "3", "RL_ASSISTS": "1", "RL_SAVES": "0", "RL_SHOTS": "5" }
    },
    {
      "name": "Dylan",
      "stats": { "RL_SCORE": "200", "RL_GOALS": "1", "RL_ASSISTS": "0", "RL_SAVES": "2", "RL_SHOTS": "3" }
    }
  ],
  "winners": ["Mark"]
}
```

- `gameId` — matches `GAME_CONFIGS` in `src/lib/constants.ts` (2 = Rocket League, 1 = Mario Kart 8, etc).
- `sessionPlayers` — real RDC player names (must match a key in `PLAYER_MAPPINGS`, `src/app/(routes)/admin/_utils/player-mappings.ts`) for exactly the players in this screenshot. This becomes the session roster the provider/processor matches names against.
- `players[].stats` — expected **final** stat values, keyed by `StatName` (e.g. `RL_GOALS`, not the raw field key `rl_goals`), as strings — this is what `analyzeScreenShot` actually returns and what ends up in the database. Only include the stats you want scored; omitted stats aren't counted.
- `winners` — expected winner names, order doesn't matter.

Start with ~20 fixtures across the games/scenarios you care about most.
Getting screenshots and a starting `expected.json`:

- **The scoreboard harvester (`scripts/scoreboard-harvester/`)** can build fixtures
  directly, on any OS:

  ```bash
  pnpm harvest -- extract --game rocket-league --video ./game.mp4 \
    --detect-model google:gemini-2.5-flash --emit-fixtures scripts/vision-eval/fixtures
  ```

  This finds each end-of-match scoreboard, runs the app's real extraction on it, and
  writes `<video-id>-match-NN/{image.png,expected.json}` straight into the fixtures
  directory. Every generated `expected.json` starts with `"_draft": true` — **check
  every stat value against the actual screenshot and delete `_draft` before trusting
  it**; `loadFixtures` warns loudly on any case still marked as a draft, and this eval
  script only reports scores, it doesn't verify them for you. See the harvester's
  README for detector/model options.
- Real uploads you've already saved from the admin vision modal (hand-label
  `expected.json` yourself).
- Grab a frame manually (`ffmpeg -ss <time> -i video.mp4 -frames:v 1 image.png`) and
  hand-label it, if you don't want to run the harvester.

## What it reports, per provider

- **success / checkReq / failed** — rate of each `AnalysisResults` status.
- **playerMatch** — fraction of expected players the provider found by name.
- **statMatch** — fraction of expected stat values that came out exactly right.
- **winnerAcc** — fraction of fixtures where the computed winner(s) matched exactly.
- **p50 / p95** — latency of the `extract()` call, in ms.

## Notes

- This mirrors `analyzeScreenShot`'s pipeline directly (see `run-case.ts`)
  rather than calling it, since that function's `after()`/PostHog calls need
  an active Next.js request scope a bare script doesn't have. Keep the two in
  sync if that orchestration changes.
- Numbers only mean something once compared to a stable fixture set — don't
  reshuffle fixtures between provider runs you're comparing.
