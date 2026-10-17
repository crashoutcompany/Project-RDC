import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { GamesEnum } from "@/lib/constants";
import { getFighterArt } from "@/lib/fighters";
import {
  filterSessions,
  sorryRanks,
  sorryScale,
  sorryScaleFor,
  summarizeArena,
  killDeathRatio,
  topFive,
  type Fighter,
  type SorryEntry,
} from "../rdc-stats";
import type { Sessions } from "@/app/(routes)/(groups)/games/[slug]/_helpers/dashboard";

const player = (playerName: string) => ({ playerName });
const pos = (playerName: string, value: string) => ({
  value,
  player: player(playerName),
  gameStat: { statName: "MK8_POS" },
});

const sessions = [
  {
    date: new Date("2025-06-23T12:00:00Z"),
    dayWinners: [player("Ben")],
    sets: [
      {
        setWinners: [player("Ben")],
        matches: [
          {
            matchWinners: [player("Ben")],
            playerSessions: [
              { playerStats: [pos("Ben", "1"), pos("Dylan", "3")] },
            ],
          },
          {
            matchWinners: [player("Dylan")],
            playerSessions: [
              { playerStats: [pos("Ben", "3"), pos("Dylan", "1")] },
            ],
          },
          {
            matchWinners: [player("Ben")],
            playerSessions: [{ playerStats: [pos("Ben", "2")] }],
          },
        ],
      },
    ],
  },
  {
    date: new Date("2024-05-01T12:00:00Z"),
    dayWinners: [],
    sets: [
      {
        setWinners: [player("Dylan")],
        matches: [{ matchWinners: [player("Dylan")], playerSessions: [] }],
      },
    ],
  },
] as unknown as Sessions;

describe("summarizeArena", () => {
  const arena = summarizeArena(GamesEnum.MarioKart8, "Mario Kart 8", sessions);

  it("counts matches, sets and the latest session date", () => {
    expect(arena.sessions).toBe(2);
    expect(arena.matches).toBe(4);
    expect(arena.sets).toBe(2);
    expect(arena.lastPlayed).toBe("Jun 23, 2025");
  });

  it("tallies per-player wins and average position", () => {
    expect(arena.records.ben).toEqual({
      name: "Ben",
      matches: 2,
      sets: 1,
      days: 1,
      avgPos: 2,
    });
    expect(arena.records.dylan).toMatchObject({ matches: 2, sets: 1, days: 0 });
    expect(arena.records.dylan.avgPos).toBe(2);
  });

  it("reports the champion by display name, not the lookup key", () => {
    expect(arena.champion).toBe("Ben");
  });

  it("returns empty stats for a game with no sessions", () => {
    const empty = summarizeArena(GamesEnum.SpeedRunners, "SpeedRunners", []);
    expect(empty).toMatchObject({
      matches: 0,
      lastPlayed: null,
      champion: null,
      records: {},
    });
  });
});

describe("sorryScale", () => {
  const fighter = (name: string): Fighter => ({
    playerId: 0,
    name,
    slug: name.toLowerCase(),
    art: getFighterArt(name),
    wins: null,
    winShare: null,
    hp: 0,
  });

  it("gives the best average rank the fullest bar and no-win members an empty one", () => {
    const arena = {
      ...summarizeArena(GamesEnum.MarioKart8, "Mario Kart 8", sessions),
      index: 1,
    };
    arena.records.ben.matches = 3;
    expect(topFive(arena).map((e) => e.slug)).toEqual(["ben", "dylan"]);
    expect(topFive(arena).map((e) => e.player)).toEqual(["Ben", "Dylan"]);

    const [ben, dylan, mark] = sorryScale(
      [fighter("Ben"), fighter("Dylan"), fighter("Mark")],
      [arena],
    );
    expect(ben).toMatchObject({ avgRank: 1, fill: 1 });
    expect(dylan.avgRank).toBe(2);
    expect(dylan.fill).toBeLessThan(ben.fill);
    expect(mark).toMatchObject({ avgRank: null, fill: 0 });
  });
});

describe("sorryRanks", () => {
  const entry = (name: string, avgRank: number | null): SorryEntry => ({
    fighter: {
      playerId: 0,
      name,
      slug: name.toLowerCase(),
      art: getFighterArt(name),
      wins: null,
      winShare: null,
      hp: 0,
    },
    avgRank,
    fill: 0,
  });

  it("gives #1 to the sorriest player (worst average rank), not the strongest", () => {
    const ranks = sorryRanks([
      entry("Ben", 1),
      entry("Dylan", 3.5),
      entry("Mark", 2),
    ]);
    expect(ranks.get("dylan")).toBe(1);
    expect(ranks.get("mark")).toBe(2);
    expect(ranks.get("ben")).toBe(3);
  });

  it("leaves members without any wins unranked", () => {
    const ranks = sorryRanks([entry("Ben", 1), entry("Des", null)]);
    expect(ranks.get("ben")).toBe(1);
    expect(ranks.has("des")).toBe(false);
  });
});

describe("killDeathRatio", () => {
  it("divides kills by deaths", () => {
    expect(killDeathRatio(9, 3)).toBe(3);
  });

  it("floors deaths at 1", () => {
    expect(killDeathRatio(5, 0)).toBe(5);
  });
});

/** A session whose matches are won by `winners`, one match per entry. */
const winsSession = (date: string, winners: string[]) =>
  ({
    date: new Date(date),
    dayWinners: [],
    sets: [
      {
        setWinners: [],
        matches: winners.map((w) => ({
          matchWinners: [player(w)],
          playerSessions: [],
        })),
      },
    ],
  }) as unknown as Sessions[number];

describe("filterSessions", () => {
  const dated = [
    { date: new Date("2025-01-01T12:00:00Z"), id: "old" },
    { date: new Date("2025-06-25T12:00:00Z"), id: "recent" },
    { date: new Date("2025-06-30T12:00:00Z"), id: "newest" },
  ];
  const now = new Date("2025-07-01T12:00:00Z");

  it("returns every session for all-time", () => {
    expect(filterSessions(dated, "all", now)).toHaveLength(3);
  });

  it("keeps sessions from the last 30 days relative to now", () => {
    expect(filterSessions(dated, "30d", now).map((s) => s.id)).toEqual([
      "recent",
      "newest",
    ]);
  });

  it("keeps the 10 most recent sessions regardless of input order", () => {
    const many = Array.from({ length: 12 }, (_, i) => ({
      date: new Date(Date.UTC(2024, 0, i + 1)),
    }));
    const shuffled = [...many].reverse();
    const last = filterSessions(shuffled, "last10");
    expect(last).toHaveLength(10);
    expect(last[0].date).toEqual(many[11].date);
    expect(last[9].date).toEqual(many[2].date);
    expect(shuffled[0]).toBe(many[11]);
  });
});

describe("sorryScaleFor", () => {
  const fighter = (name: string): Fighter => ({
    playerId: 0,
    name,
    slug: name.toLowerCase(),
    art: getFighterArt(name),
    wins: null,
    winShare: null,
    hp: 0,
  });
  const roster = [fighter("Ben"), fighter("Dylan")];
  const now = new Date("2025-07-01T12:00:00Z");
  const mk8 = [
    winsSession("2024-01-01T12:00:00Z", ["Dylan", "Dylan", "Dylan"]),
    winsSession("2025-06-25T12:00:00Z", ["Ben", "Ben"]),
  ];

  it("ranks by all-time wins when the range is all", () => {
    const [ben, dylan] = sorryScaleFor(
      roster,
      [{ slug: GamesEnum.MarioKart8, name: "Mario Kart 8", sessions: mk8 }],
      "all",
      now,
    );
    expect(dylan.avgRank).toBe(1);
    expect(ben.avgRank).toBe(2);
  });

  it("only scores sessions inside the time range", () => {
    const [ben, dylan] = sorryScaleFor(
      roster,
      [{ slug: GamesEnum.MarioKart8, name: "Mario Kart 8", sessions: mk8 }],
      "30d",
      now,
    );
    expect(ben).toMatchObject({ avgRank: 1, fill: 1 });
    expect(dylan).toMatchObject({ avgRank: null, fill: 0 });
  });

  it("averages a member's rank across games", () => {
    const [ben, dylan] = sorryScaleFor(
      roster,
      [
        {
          slug: GamesEnum.MarioKart8,
          name: "Mario Kart 8",
          sessions: [winsSession("2025-06-25T12:00:00Z", ["Ben", "Dylan"])],
        },
        {
          slug: GamesEnum.RocketLeague,
          name: "Rocket League",
          sessions: [
            winsSession("2025-06-25T12:00:00Z", ["Dylan", "Dylan", "Ben"]),
          ],
        },
      ],
      "all",
      now,
    );
    expect(ben.avgRank).toBe(1.5);
    expect(dylan.avgRank).toBe(1.5);
  });

  it("takes the last 10 sessions across all games, not per game", () => {
    const recent = Array.from({ length: 10 }, (_, i) =>
      winsSession(`2025-06-${String(i + 10).padStart(2, "0")}T12:00:00Z`, [
        "Ben",
      ]),
    );
    const [ben, dylan] = sorryScaleFor(
      roster,
      [
        {
          slug: GamesEnum.MarioKart8,
          name: "Mario Kart 8",
          sessions: [winsSession("2024-01-01T12:00:00Z", ["Dylan"])],
        },
        {
          slug: GamesEnum.RocketLeague,
          name: "Rocket League",
          sessions: recent,
        },
      ],
      "last10",
      now,
    );
    expect(ben.avgRank).toBe(1);
    expect(dylan.avgRank).toBeNull();
  });

  it("returns no ranks when no game has matches in the range", () => {
    const scale = sorryScaleFor(
      roster,
      [{ slug: GamesEnum.MarioKart8, name: "Mario Kart 8", sessions: [] }],
      "last10",
      now,
    );
    expect(scale.every((e) => e.avgRank === null)).toBe(true);
  });
});
