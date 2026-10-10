import type { StatName } from "@/lib/stat-names";
import type { VisionResult } from "@/lib/visionTypes";
import { screenStatConfigs, type GameSpec } from "./games";
import { resolvePlayerId, type ScoreboardOutput } from "./prompt";
import type { Prediction } from "./types";

/** LLM structured output → Prediction. Shared by every LLM method. */
export function fromLlmOutput(spec: GameSpec, output: ScoreboardOutput): Prediction {
  const configs = screenStatConfigs(spec);
  const players = output.players.map((row) => ({
    playerId: resolvePlayerId(row.member) ?? resolvePlayerId(row.gamertag),
    label: row.gamertag,
    team: row.team,
    stats: Object.fromEntries(
      configs.map((config) => {
        const value = (row.stats as Record<string, number | null>)[config.fieldKey];
        return [config.name, value === null || value === undefined ? null : String(value)];
      }),
    ) as Partial<Record<StatName, string | null>>,
  }));

  let winnerIds: number[];
  if (spec.winner.by === "team-label") {
    const label = output.winning_team?.trim().toUpperCase();
    winnerIds = label
      ? players
          .filter((p) => p.team?.trim().toUpperCase() === label)
          .flatMap((p) => (p.playerId === null ? [] : [p.playerId]))
      : [];
  } else winnerIds = winnersByStat(players, spec.winner.stat, spec.winner.by);

  return { players, winnerIds };
}

/** Azure + game processor result → Prediction. */
export function fromAzureResult(result: VisionResult): Prediction {
  return {
    players: result.players.map((p) => ({
      playerId: typeof p.playerId === "number" ? p.playerId : null,
      label: p.name,
      team: p.teamKey ?? null,
      stats: Object.fromEntries(
        p.stats.map((s) => [s.stat, s.statValue]),
      ) as Partial<Record<StatName, string>>,
    })),
    winnerIds: (result.winner ?? []).flatMap((p) =>
      typeof p.playerId === "number" ? [p.playerId] : [],
    ),
  };
}

function winnersByStat(
  players: Prediction["players"],
  stat: StatName,
  direction: "lowest" | "highest",
): number[] {
  const ranked = players.flatMap((p) => {
    const value = Number(p.stats[stat]);
    return p.playerId !== null && Number.isFinite(value) ? [{ id: p.playerId, value }] : [];
  });
  if (ranked.length === 0) return [];
  const best =
    direction === "lowest"
      ? Math.min(...ranked.map((r) => r.value))
      : Math.max(...ranked.map((r) => r.value));
  return ranked.filter((r) => r.value === best).map((r) => r.id);
}
