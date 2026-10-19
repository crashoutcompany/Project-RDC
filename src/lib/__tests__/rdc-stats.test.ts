import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { GamesEnum } from "@/lib/constants";
import { getFighterArt } from "@/lib/fighters";
import {
  sorryRanks,
  sorryScale,
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
