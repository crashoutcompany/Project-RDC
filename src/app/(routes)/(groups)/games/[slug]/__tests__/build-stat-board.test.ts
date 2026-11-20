import { GamesEnum } from "@/lib/constants";
import { STAT_CONFIGS, statRollup } from "@/lib/stat-configs";
import {
  buildStatBoard,
  STAT_BOARDS,
  statBoardFor,
  type StatBoardConfig,
} from "../_helpers/stat-board";

const MEMBERS = [
  { playerId: 1, playerName: "Mark" },
  { playerId: 2, playerName: "Dylan" },
];

const total = (playerId: number, statName: string, sum: number, avg = sum) => ({
  playerId,
  statName,
  sum: BigInt(sum),
  avg,
});

describe("buildStatBoard", () => {
  it("takes rollups and wording from STAT_CONFIGS", () => {
    const board: StatBoardConfig = {
      playedWhen: ["COD_KILLS"],
      charts: [{ stat: "COD_KILLS" }, { stat: "COD_POS" }],
    };

    const { charts, config } = buildStatBoard(board, MEMBERS, []);

    expect(charts).toEqual([
      { dataKey: "kills.sum", title: "Kills Per Player", description: "Kills all time" },
      { dataKey: "pos.avg", title: "Average Position", description: "Average Position" },
    ]);
    expect(config).toEqual({
      playerName: { label: "Player" },
      "kills.sum": { label: "Total Kills" },
      "pos.avg": { label: "Avg Position" },
    });
  });

  it("lets a chart override the rollup and the wording", () => {
    const board: StatBoardConfig = {
      playedWhen: ["COD_SCORE"],
      charts: [
        { stat: "COD_SCORE", rollup: "average" },
        { stat: "COD_MELEES", noun: "Melees", description: "Knife kills" },
      ],
    };

    const { charts, config } = buildStatBoard(board, MEMBERS, []);

    expect(charts).toEqual([
      { dataKey: "score.avg", title: "Average Score", description: "Average Score" },
      { dataKey: "melees.sum", title: "Melees Per Player", description: "Knife kills" },
    ]);
    expect(config["melees.sum"]).toEqual({ label: "Total Melees" });
  });

  it.each([
    ["on its own", { stat: "RL_DAY" }],
    ["even with an explicit rollup", { stat: "RL_DAY", rollup: "sum" }],
  ] as const)("never charts a stat marked skip, %s", (_label, dayChart) => {
    const board: StatBoardConfig = {
      playedWhen: ["RL_GOALS"],
      charts: [{ stat: "RL_GOALS" }, dayChart],
    };

    const { charts, rows, config } = buildStatBoard(board, MEMBERS, [
      total(1, "RL_GOALS", 4),
      total(1, "RL_DAY", 9),
    ]);

    expect(charts.map((c) => c.dataKey)).toEqual(["goals.sum"]);
    expect(Object.keys(config)).toEqual(["playerName", "goals.sum"]);
    expect(rows).toEqual([
      { playerId: 1, playerName: "Mark", goals: { sum: 4, avg: 4 } },
    ]);
  });

  it("keeps member order and leaves out players who have not played", () => {
    const board: StatBoardConfig = {
      playedWhen: ["MR_KILLS", "MR_ASSISTS"],
      charts: [{ stat: "MR_KILLS" }],
    };
    const members = [...MEMBERS, { playerId: 3, playerName: "Ben" }];

    const { rows } = buildStatBoard(board, members, [
      total(3, "MR_ASSISTS", 2),
      total(2, "MR_KILLS", 0),
      total(1, "MR_KILLS", 5, 2.5),
    ]);

    expect(rows).toEqual([
      { playerId: 1, playerName: "Mark", kills: { sum: 5, avg: 2.5 } },
      { playerId: 3, playerName: "Ben", kills: { sum: 0, avg: 0 } },
    ]);
  });

  it("treats a stat with no numeric values (NULL totals) as zero", () => {
    const board: StatBoardConfig = {
      playedWhen: ["LC_DEATHS"],
      charts: [{ stat: "LC_DEATHS" }],
    };

    const { rows } = buildStatBoard(board, MEMBERS, [
      { playerId: 1, statName: "LC_DEATHS", sum: null, avg: null },
    ]);

    expect(rows).toEqual([]);
  });

  it("adds charts computed from several stats", () => {
    const { rows } = buildStatBoard(STAT_BOARDS[GamesEnum.MarvelRivals], MEMBERS, [
      total(1, "MR_KILLS", 9),
      total(1, "MR_DEATHS", 0),
      total(1, "MR_TRIPLE_KILL", 2),
      total(1, "MR_HEXA_KILL", 1),
    ]);

    // No deaths: the ratio is floored at one death rather than dividing by zero.
    expect(rows[0]).toMatchObject({ kd: 9, multiKills: { sum: 3 } });
  });
});

describe("STAT_BOARDS", () => {
  const statsOf = (board: StatBoardConfig) =>
    board.charts.flatMap((chart) => ("stat" in chart ? [chart.stat] : []));
  const configOf = (stat: string) =>
    Object.values(STAT_CONFIGS).find((config) => config.name === stat);

  it.each(Object.entries(STAT_BOARDS))(
    "%s only charts stats that are defined and not skipped",
    (_slug, board) => {
      for (const stat of [...statsOf(board), ...board.playedWhen]) {
        const config = configOf(stat);
        expect(config, stat).toBeDefined();
        expect(statRollup(config!), stat).not.toBe("skip");
      }
      expect(buildStatBoard(board, [], []).charts).toHaveLength(board.charts.length);
    },
  );

  it.each(Object.entries(STAT_BOARDS))("%s draws from one game's stats", (_slug, board) => {
    const gameIds = new Set(statsOf(board).map((stat) => configOf(stat)!.gameId));

    expect(gameIds.size).toBe(1);
  });
});

describe("statBoardFor", () => {
  it("returns the board of a game that has one", () => {
    expect(statBoardFor(GamesEnum.CallOfDuty)).toBe(STAT_BOARDS[GamesEnum.CallOfDuty]);
  });

  it.each(["newgame", "constructor", "__proto__", "toString", "hasOwnProperty", "valueOf"])(
    "has no board for %s, so the page shows none",
    (slug) => {
      expect(statBoardFor(slug)).toBeUndefined();
    },
  );
});
