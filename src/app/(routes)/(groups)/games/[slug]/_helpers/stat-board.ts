import { GamesEnum } from "@/lib/constants";
import { killDeathRatio } from "@/lib/rdc-stats";
import { STAT_CONFIGS, statRollup } from "@/lib/stat-configs";
import type { StatName } from "@/lib/stat-names";

type Aggregate = { sum: number; avg: number };

/** A player's all-time totals for one stat; zeros when they have none. */
type Totals = (stat: StatName) => Aggregate;

/**
 * A chart of one stat. The rollup, labels and titles come from STAT_CONFIGS;
 * the optional fields only pin wording or a rollup that differs from it.
 */
type StatChart = {
  stat: StatName;
  rollup?: "sum" | "average";
  /** Replaces the stat's display name in the generated copy. */
  noun?: string;
  title?: string;
  description?: string;
};

/** A chart of a value computed from several stats (a ratio, a combined count). */
type DerivedChart = {
  dataKey: string;
  label: string;
  title: string;
  description: string;
  value: (totals: Totals) => number;
};

export type StatBoardConfig = {
  charts: (StatChart | DerivedChart)[];
  /** A player is on the board when these stats sum to more than zero. */
  playedWhen: StatName[];
  matchWinsLabel?: string;
  /** Shown instead of the board when no player has played. */
  emptyMessage?: string;
};

const MULTI_KILLS: StatName[] = [
  "MR_TRIPLE_KILL",
  "MR_QUADRA_KILL",
  "MR_PENTA_KILL",
  "MR_HEXA_KILL",
];

export const STAT_BOARDS: Record<GamesEnum, StatBoardConfig> = {
  [GamesEnum.CallOfDuty]: {
    playedWhen: ["COD_SCORE"],
    charts: [
      { stat: "COD_KILLS" },
      { stat: "COD_DEATHS" },
      { stat: "COD_SCORE", rollup: "average" },
      { stat: "COD_POS" },
      { stat: "COD_MELEES", noun: "Melees" },
    ],
  },
  [GamesEnum.RocketLeague]: {
    playedWhen: ["RL_SCORE"],
    charts: [
      { stat: "RL_GOALS", description: "Goals scored all time" },
      { stat: "RL_SAVES", description: "Shots saved all time" },
      {
        stat: "RL_ASSISTS",
        title: "Assists All Time",
        description: "All time Assists",
      },
      { stat: "RL_SCORE", rollup: "average" },
    ],
  },
  [GamesEnum.MarioKart8]: {
    playedWhen: ["MK8_POS"],
    matchWinsLabel: "Races won",
    charts: [
      { stat: "MK8_POS", description: "Average race position all time" },
    ],
  },
  [GamesEnum.LethalCompany]: {
    playedWhen: ["LC_DEATHS"],
    charts: [{ stat: "LC_DEATHS" }],
  },
  [GamesEnum.SpeedRunners]: {
    playedWhen: ["SR_WINS"],
    matchWinsLabel: "Races won",
    charts: [{ stat: "SR_WINS" }, { stat: "SR_SETS" }, { stat: "SR_POS" }],
  },
  [GamesEnum.MarvelRivals]: {
    playedWhen: ["MR_KILLS", "MR_DEATHS", "MR_ASSISTS"],
    emptyMessage: "No Marvel Rivals stats yet",
    // MR_ACCURACY is left out: it can be fractional and the totals query only
    // counts whole numbers.
    charts: [
      { stat: "MR_KILLS" },
      { stat: "MR_DEATHS" },
      { stat: "MR_ASSISTS" },
      {
        dataKey: "kd",
        label: "K/D",
        title: "K/D Ratio",
        description: "Total kills divided by total deaths",
        value: (totals) =>
          killDeathRatio(totals("MR_KILLS").sum, totals("MR_DEATHS").sum),
      },
      { stat: "MR_DMG", description: "Damage dealt all time" },
      { stat: "MR_DMG_BLOCKED", description: "Damage blocked all time" },
      { stat: "MR_HEALING", description: "Healing done all time" },
      {
        dataKey: "multiKills.sum",
        label: "Multi-kills",
        title: "Multi-kills Per Player",
        description: "Triple, quadra, penta and hexa kills all time",
        value: (totals) =>
          MULTI_KILLS.reduce((count, stat) => count + totals(stat).sum, 0),
      },
    ],
  },
};

const configFor = (stat: StatName) =>
  Object.values(STAT_CONFIGS).find((config) => config.name === stat);

/** "COD_KILLS" -> "kills": the row key a stat's totals are stored under. */
const rowKey = (stat: StatName) =>
  stat.slice(stat.indexOf("_") + 1).toLowerCase();

type ResolvedChart = {
  dataKey: string;
  label: string;
  title: string;
  description: string;
  /** Row fields this chart contributes for one player. */
  fields: (totals: Totals) => Record<string, unknown>;
};

/**
 * Turns a chart definition into what the chart component needs. Returns
 * undefined for a stat marked `rollup: "skip"` in STAT_CONFIGS (or missing
 * from it): those never aggregate meaningfully, so they are never charted.
 */
function resolveChart(
  chart: StatChart | DerivedChart,
): ResolvedChart | undefined {
  if ("value" in chart) {
    const [key, field] = chart.dataKey.split(".");
    return {
      ...chart,
      fields: (totals) => {
        const value = chart.value(totals);
        return { [key]: field ? { [field]: value } : value };
      },
    };
  }

  const config = configFor(chart.stat);
  if (!config || statRollup(config) === "skip") return undefined;

  const average = (chart.rollup ?? statRollup(config)) === "average";
  const noun = chart.noun ?? config.displayName;
  const key = rowKey(chart.stat);
  return {
    dataKey: `${key}.${average ? "avg" : "sum"}`,
    label: average ? `Avg ${noun}` : `Total ${noun}`,
    title: chart.title ?? (average ? `Average ${noun}` : `${noun} Per Player`),
    description:
      chart.description ?? (average ? `Average ${noun}` : `${noun} all time`),
    fields: (totals) => ({ [key]: totals(chart.stat) }),
  };
}

/** One row of the grouped totals query (`getStatTotalsByGame`). */
export type StatTotal = {
  playerId: number;
  statName: string;
  sum: bigint | number | null;
  avg: { toString(): string } | number | null;
};

/**
 * Builds a game's stat board from its config and one grouped totals result:
 * the charts to draw, their shared label config, and a row per player who has
 * played (in member order).
 */
export function buildStatBoard<Member extends { playerId: number }>(
  board: StatBoardConfig,
  members: Member[],
  statTotals: StatTotal[],
) {
  const byPlayerAndStat = new Map(
    statTotals.map((row) => [
      `${row.playerId}:${row.statName}`,
      { sum: Number(row.sum ?? 0), avg: Number(row.avg ?? 0) },
    ]),
  );
  const charts = board.charts.flatMap((chart) => resolveChart(chart) ?? []);

  const rows = members.flatMap((member) => {
    const totals: Totals = (stat) =>
      byPlayerAndStat.get(`${member.playerId}:${stat}`) ?? { sum: 0, avg: 0 };

    const played = board.playedWhen.reduce(
      (n, stat) => n + totals(stat).sum,
      0,
    );
    if (!(played > 0)) return [];

    return [
      Object.assign({ ...member }, ...charts.map((c) => c.fields(totals))),
    ];
  });

  return {
    rows,
    charts: charts.map(({ dataKey, title, description }) => ({
      dataKey,
      title,
      description,
    })),
    config: Object.fromEntries([
      ["playerName", { label: "Player" }],
      ...charts.map(({ dataKey, label }) => [dataKey, { label }]),
    ]) as Record<string, { label: string }>,
  };
}
