import { z } from "zod";
import { scoreDetections } from "./finder";
import { GAMES } from "./games";
import { fromLlmOutput } from "./normalize";
import { buildPrompt, buildSchema, promptFingerprint } from "./prompt";

const rl = GAMES["rocket-league"];
const mk8 = GAMES["mario-kart-8"];

test("maps members, falls back to gamertags, and reads the winning team", () => {
  const prediction = fromLlmOutput(rl, {
    players: [
      { gamertag: "Dpatel254", member: "Dylan", team: "BLUE", stats: { rl_score: 353, rl_goals: 1, rl_assists: 1, rl_saves: 1, rl_shots: 3 } },
      { gamertag: "Jabenixem", member: null, team: "Blue", stats: { rl_score: 309, rl_goals: 1, rl_assists: 0, rl_saves: 1, rl_shots: 2 } },
      { gamertag: "SomeRandom", member: null, team: "ORANGE", stats: { rl_score: 96, rl_goals: 0, rl_assists: 0, rl_saves: 0, rl_shots: null } },
    ],
    winning_team: "blue",
  });

  expect(prediction.players.map((p) => p.playerId)).toEqual([2, 3, null]);
  expect(prediction.players[0].stats).toMatchObject({ RL_SCORE: "353", RL_GOALS: "1" });
  expect(prediction.players[2].stats.RL_SHOTS).toBeNull();
  expect(prediction.winnerIds).toEqual([2, 3]);
});

test("solo games pick the winner from the stat rule", () => {
  const prediction = fromLlmOutput(mk8, {
    players: [
      { gamertag: "SupremeMvp0020", member: "Mark", team: null, stats: { mk8_place: 2 } },
      { gamertag: "Dpatel254", member: "Dylan", team: null, stats: { mk8_place: 1 } },
    ],
    winning_team: null,
  });
  expect(prediction.winnerIds).toEqual([2]);
});

test("every game builds a JSON schema and a stable prompt", () => {
  for (const spec of Object.values(GAMES)) {
    const schema = z.toJSONSchema(buildSchema(spec)) as { properties: Record<string, unknown> };
    expect(Object.keys(schema.properties)).toEqual(["players", "winning_team"]);
    expect(buildPrompt(spec)).toContain(spec.displayName);
    expect(promptFingerprint(spec)).toBe(promptFingerprint(spec));
  }
});

test("finder detections match known scoreboards once and flag extras", () => {
  const known = [100, 500, 900];
  // Two frames of the same scoreboard, one near-miss, one unrelated hit.
  const result = scoreDetections([95, 104, 520, 1500], known);
  expect(result).toEqual({ found: 2, falsePositiveTimes: [1500], missedTimes: [900] });
});
