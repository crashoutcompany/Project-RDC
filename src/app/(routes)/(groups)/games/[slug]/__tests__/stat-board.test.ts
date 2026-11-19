import { vi } from "vitest";
import type { ReactElement, ReactNode } from "react";
import { Decimal } from "@prisma/client/runtime/client";
import type { Player } from "@/generated/prisma/client";
import { GamesEnum } from "@/lib/constants";
import type { StatName } from "@/lib/stat-names";
import { getStatTotalsByGame } from "prisma/lib/games";
import { StatBoard } from "../_components/stat-board";
import { STAT_BOARDS } from "../_helpers/stat-board";

// Client chart components are replaced by tags so the element tree the server
// component returns can be read without rendering Recharts.
vi.mock("../_components/charts", () => ({
  ChartGrid: "ChartGrid",
  CustomChart: "CustomChart",
}));
vi.mock("../_components/tabbed-chart", () => ({ TabbedChart: "TabbedChart" }));
vi.mock("prisma/lib/games", () => ({ getStatTotalsByGame: vi.fn() }));

const MEMBERS = [
  { playerId: 1, playerName: "Mark" },
  { playerId: 2, playerName: "Dylan" },
  { playerId: 3, playerName: "Ben" },
  { playerId: 4, playerName: "Lee" },
] as Player[];

/** Per-match stat values from approved sessions, by player id. Lee has none. */
const VALUES: Record<number, Partial<Record<StatName, number[]>>> = {
  1: {
    COD_KILLS: [10, 20],
    COD_DEATHS: [5, 7],
    COD_SCORE: [1000, 2000],
    COD_POS: [1, 3],
    COD_MELEES: [2, 0],
    RL_GOALS: [2, 3, 1],
    RL_ASSISTS: [1, 0, 2],
    RL_SAVES: [4, 4, 1],
    RL_SHOTS: [5, 5, 5],
    RL_SCORE: [500, 610, 333],
    RL_DAY: [1, 1, 1],
    MK8_POS: [1, 2, 4],
    MK8_DAY: [1, 1, 1],
    LC_DEATHS: [3, 2],
    SR_WINS: [3],
    SR_SETS: [2],
    SR_POS: [1, 2],
    MR_KILLS: [10, 15],
    MR_DEATHS: [4, 6],
    MR_ASSISTS: [3, 3],
    MR_DMG: [5000, 7000],
    MR_DMG_BLOCKED: [100],
    MR_HEALING: [0],
    MR_TRIPLE_KILL: [1, 1],
    MR_QUADRA_KILL: [1],
    MR_PENTA_KILL: [0],
  },
  2: {
    COD_KILLS: [7],
    COD_DEATHS: [9],
    COD_SCORE: [900],
    COD_POS: [2],
    RL_GOALS: [0],
    RL_ASSISTS: [3],
    RL_SAVES: [2],
    RL_SCORE: [250],
    RL_DAY: [1],
    MK8_POS: [3, 3],
    LC_DEATHS: [0],
    SR_WINS: [0],
    SR_SETS: [1],
    SR_POS: [3],
    MR_KILLS: [0],
    MR_DEATHS: [0],
    MR_ASSISTS: [2],
    MR_DMG: [300],
  },
  // Ben has rows for every game but none for the stat that marks a player as
  // having played it, so he is left off every board except Lethal Company.
  3: {
    COD_KILLS: [4],
    COD_DEATHS: [1],
    COD_SCORE: [0],
    RL_GOALS: [1],
    MK8_DAY: [1],
    LC_DEATHS: [1],
    SR_SETS: [0],
    SR_POS: [2],
    MR_DMG: [900],
  },
};

/** What Postgres returns for SUM/AVG over a player's values (null with no rows). */
const aggregate = (values: number[] | undefined) => {
  if (!values?.length) return { sum: null, avg: null };
  const sum = values.reduce((a, b) => a + b, 0);
  return { sum: BigInt(sum), avg: new Decimal(sum / values.length) };
};

const GAMES = {
  [GamesEnum.CallOfDuty]: { gameId: 3, gameName: "Call of Duty", prefix: "COD_" },
  [GamesEnum.RocketLeague]: { gameId: 2, gameName: "Rocket League", prefix: "RL_" },
  [GamesEnum.MarioKart8]: { gameId: 1, gameName: "Mario Kart 8", prefix: "MK8_" },
  [GamesEnum.LethalCompany]: { gameId: 4, gameName: "Lethal Company", prefix: "LC_" },
  [GamesEnum.SpeedRunners]: { gameId: 5, gameName: "Speedrunners", prefix: "SR_" },
  [GamesEnum.MarvelRivals]: { gameId: 6, gameName: "Marvel Rivals", prefix: "MR_" },
};

/** One grouped row per player and stat of the game, as the totals query returns. */
const databaseIsUp = () =>
  vi.mocked(getStatTotalsByGame).mockImplementation(async (gameId) => {
    const { prefix } = Object.values(GAMES).find((g) => g.gameId === gameId)!;
    const data = Object.entries(VALUES).flatMap(([playerId, stats]) =>
      Object.entries(stats)
        .filter(([statName]) => statName.startsWith(prefix))
        .map(([statName, values]) => ({
          playerId: Number(playerId),
          statName,
          ...aggregate(values),
        })),
    );
    return { success: true, data } as never;
  });

const databaseIsDown = () =>
  vi.mocked(getStatTotalsByGame).mockResolvedValue({
    success: false,
    error: "A database error occurred.",
    data: null,
  });

const WINS = [{ player: "Mark", matchWins: 3, setWins: 1 }];

/** The only seam that changes with the implementation: slug in, element tree out. */
const renderBoard = (slug: GamesEnum): Promise<ReactNode> => {
  const { gameId, gameName } = GAMES[slug];
  return StatBoard({
    board: STAT_BOARDS[slug],
    game: { gameId, gameName },
    members: MEMBERS,
    winsPerPlayer: WINS,
  });
};

type Props = Record<string, unknown> & { children?: ReactNode };

/** Flattens the tree into its chart elements and any text it shows. */
const read = (node: ReactNode) => {
  const charts: Props[] = [];
  const wins: Props[] = [];
  const text: string[] = [];

  const walk = (child: ReactNode) => {
    if (Array.isArray(child)) return child.forEach(walk);
    if (typeof child === "string") return void text.push(child);
    if (!child || typeof child !== "object" || !("props" in child)) return;

    const { type, props } = child as ReactElement<Props>;
    if (typeof type === "function")
      return walk((type as (props: Props) => ReactNode)(props));
    if (type === "CustomChart") return void charts.push(props);
    if (type === "TabbedChart") return void wins.push(props);
    walk(props.children);
  };
  walk(node);

  return { charts, wins, text };
};

/** Everything a board hands to its charts, in the shape the charts receive it. */
const board = async (slug: GamesEnum) => {
  const { charts, wins, text } = read(await renderBoard(slug));
  const rows = charts[0]?.data;
  for (const chart of charts) {
    expect(chart.data).toBe(rows);
    expect(chart.nameKey).toBe("playerName");
  }
  return {
    charts: charts.map(({ title, description, dataKey, config }) => ({
      title,
      description,
      dataKey,
      label: (config as Record<string, { label: string }>)[dataKey as string].label,
    })),
    rows,
    wins,
    text,
  };
};

const SLUGS = Object.keys(GAMES) as GamesEnum[];

describe("game stat boards", () => {
  describe.each(SLUGS)("%s", (slug) => {
    it("charts the same rows and labels", async () => {
      databaseIsUp();

      expect(await board(slug)).toMatchSnapshot();
    });

    it("loads every stat with one query", async () => {
      databaseIsUp();

      await renderBoard(slug);

      expect(getStatTotalsByGame).toHaveBeenCalledTimes(1);
      expect(getStatTotalsByGame).toHaveBeenCalledWith(GAMES[slug].gameId);
    });

    it("shows empty charts, or the game's empty message, when nothing is recorded", async () => {
      vi.mocked(getStatTotalsByGame).mockResolvedValue({ success: true, data: [] });

      const { charts, rows, text } = await board(slug);

      if (slug === GamesEnum.MarvelRivals) {
        expect(text).toEqual(["No Marvel Rivals stats yet"]);
        expect(charts).toEqual([]);
      } else {
        expect(text).toEqual([]);
        expect(charts).toHaveLength(STAT_BOARDS[slug].charts.length);
        expect(rows).toEqual([]);
      }
    });

    it("says the stats are unavailable, and keeps the wins chart, when the query fails", async () => {
      databaseIsDown();

      const { charts, wins, text } = await board(slug);

      expect(charts).toEqual([]);
      expect(text).toContain("Stats unavailable");
      expect(wins).toEqual([expect.objectContaining({ chartData: WINS })]);
    });
  });
});
