import type { Player } from "@/generated/prisma/client";
import { VisionResultCodes } from "@/lib/constants";
import {
  processScoreboard,
  type ScoreboardFields,
} from "@/lib/vision/analyze-scoreboard";
import type {
  AnalyzedPlayersObj,
  AnalyzedTeamData,
  VisionPlayer,
} from "@/lib/visionTypes";

const MK8 = 1;
const RL = 2;
const COD = 3;
const MR = 6;

const SESSION = [
  { playerId: 1, playerName: "Mark" },
  { playerId: 2, playerName: "Dylan" },
  { playerId: 3, playerName: "Ben" },
  { playerId: 4, playerName: "Lee" },
] as Player[];

type Row = [name: string, stats: Record<string, string | undefined>];

/** Reader output for one array of player rows (Azure's field layout). */
const rows = (...players: Row[]): AnalyzedPlayersObj => ({
  type: "array",
  valueArray: players.map(([name, stats]) => ({
    type: "object",
    valueObject: {
      PlayerName: { type: "string", content: name, confidence: 1 },
      ...Object.fromEntries(
        Object.entries(stats).map(([field, content]) => [
          field,
          { type: "string", content: content as string, confidence: 1 },
        ]),
      ),
    },
  })),
});

const solo = (...players: Row[]): ScoreboardFields => [rows(...players)];

const teams = (byTeam: Record<string, Row[]>): AnalyzedTeamData[] =>
  Object.entries(byTeam).map(([teamName, players]) => ({
    teamName,
    players: rows(...players),
  }));

const run = (
  gameId: number,
  fields: ScoreboardFields,
  { ocrCorrections = true, sessionPlayers = SESSION } = {},
) => {
  const result = processScoreboard({ fields, gameId, sessionPlayers, ocrCorrections });
  if (result.status === VisionResultCodes.Failed) throw new Error(result.message);
  return {
    status: result.status,
    players: result.data.players,
    winners: (result.data.winner ?? []).map((p) => p.name),
  };
};

const statsOf = (player: VisionPlayer) =>
  Object.fromEntries(player.stats.map((s) => [s.stat, s.statValue]));

const SUCCESS = VisionResultCodes.Success;
const REVIEW = VisionResultCodes.CheckRequest;

describe("Mario Kart 8", () => {
  it("maps rows to session players and the lowest position wins", () => {
    const result = run(MK8, solo(["SupremeMvp0020", { mk8_place: "3" }], ["Dpatel254", { mk8_place: "1" }]));

    expect(result.status).toBe(SUCCESS);
    expect(result.players).toEqual([
      { playerId: 1, name: "Mark", teamKey: undefined, stats: [{ statId: 1, stat: "MK8_POS", statValue: "3" }] },
      { playerId: 2, name: "Dylan", teamKey: undefined, stats: [{ statId: 1, stat: "MK8_POS", statValue: "1" }] },
    ]);
    expect(result.winners).toEqual(["Dylan"]);
  });

  it("gives a tie to the first row", () => {
    const result = run(MK8, solo(["Mark", { mk8_place: "2" }], ["Dylan", { mk8_place: "2" }]));

    expect(result.winners).toEqual(["Mark"]);
  });

  it.each([
    ["someone who is not a member", "Some Random"],
    ["a member who is not in this session", "Des"],
  ])("drops %s and asks for review", (_label, name) => {
    const result = run(MK8, solo(["Mark", { mk8_place: "1" }], [name, { mk8_place: "2" }]));

    expect(result.status).toBe(REVIEW);
    expect(result.players.map((p) => p.name)).toEqual(["Mark"]);
  });

  it.each([
    ["an OCR zero glyph", "Z"],
    ["a missing value", undefined],
    ["text", "DNF"],
    ["a place outside 1-8", "12"],
  ])("asks for review on %s", (_label, place) => {
    const result = run(MK8, solo(["Mark", { mk8_place: place }]), { ocrCorrections: false });

    expect(result.status).toBe(REVIEW);
  });

  it("reads Azure's 7th as 1st in a lobby of fewer than seven, and asks for review", () => {
    const result = run(MK8, solo(["Mark", { mk8_place: "7" }], ["Dylan", { mk8_place: "2" }]));

    expect(result.status).toBe(REVIEW);
    expect(result.players.map((p) => p.stats[0].statValue)).toEqual(["1", "2"]);
    expect(result.winners).toEqual(["Mark"]);
  });

  it("keeps 7th when corrections are off or seven can be playing", () => {
    const fields = () => solo(["Mark", { mk8_place: "7" }]);
    const seven = Array.from({ length: 7 }, (_, i) => ({ playerId: i + 1, playerName: i ? `P${i}` : "Mark" })) as Player[];

    expect(run(MK8, fields(), { ocrCorrections: false }).players[0].stats[0].statValue).toBe("7");
    expect(run(MK8, fields(), { sessionPlayers: seven })).toMatchObject({ status: SUCCESS });
  });

  it("asks for review, with no players, when handed team-shaped data", () => {
    const result = run(MK8, teams({ BluePlayers: [["Mark", { mk8_place: "1" }]] }));

    expect(result).toEqual({ status: REVIEW, players: [], winners: [] });
  });

  it("succeeds with nobody when the reader found no rows", () => {
    expect(run(MK8, solo())).toEqual({ status: SUCCESS, players: [], winners: [] });
  });

  it("fails when the reader returned no player array at all", () => {
    expect(() => run(MK8, [])).toThrow();
  });
});

describe("Call of Duty", () => {
  const match = () =>
    solo(
      ["Mark", { cod_score: "900", cod_kills: "9", cod_deaths: "12", cod_pos: "1" }],
      ["Dylan", { cod_score: "2400", cod_kills: "24", cod_deaths: "8" }],
      ["Ben", { cod_score: "1500", cod_kills: "15", cod_deaths: "10" }],
    );

  it("orders players by score, rewrites positions to match, and the top score wins", () => {
    const result = run(COD, match());

    expect(result.status).toBe(SUCCESS);
    expect(result.players.map((p) => [p.name, statsOf(p).COD_POS])).toEqual([
      ["Dylan", "1"],
      ["Ben", "2"],
      ["Mark", "3"],
    ]);
    expect(result.players[0].stats.at(-1)).toEqual({ statId: 12, stat: "COD_POS", statValue: "1" });
    expect(result.winners).toEqual(["Dylan"]);
  });

  it("asks for review when a stat was unreadable", () => {
    const result = run(COD, solo(["Mark", { cod_score: "Z", cod_kills: undefined }]));

    expect(result.status).toBe(REVIEW);
    expect(statsOf(result.players[0])).toMatchObject({ COD_SCORE: "0", COD_KILLS: "0" });
  });

  it("drops rows that are not session players and asks for review", () => {
    const result = run(COD, solo(["Mark", { cod_score: "100" }], ["xX_Sniper_Xx", { cod_score: "900" }]));

    expect(result).toMatchObject({ status: REVIEW, winners: ["Mark"] });
    expect(result.players).toHaveLength(1);
  });

  it("fails when the reader returned no player array at all", () => {
    expect(() => run(COD, [])).toThrow();
  });
});

describe("Rocket League", () => {
  const match = () =>
    teams({
      BluePlayers: [
        ["Mark", { Score: "300", Goals: "1" }],
        ["Dylan", { Score: "250", Goals: "2" }],
      ],
      OrangePlayers: [
        ["Ben", { RL_Score: "500", RL_Goals: "2" }],
        ["Lee", { RL_Score: "90", RL_Goals: "0" }],
      ],
    });

  it("reads both teams, with or without the stat prefix, and the team with more goals wins", () => {
    const result = run(RL, match());

    expect(result.status).toBe(SUCCESS);
    expect(result.players.map((p) => [p.name, p.teamKey, statsOf(p)])).toEqual([
      ["Mark", "BluePlayers", { RL_SCORE: "300", RL_GOALS: "1" }],
      ["Dylan", "BluePlayers", { RL_SCORE: "250", RL_GOALS: "2" }],
      ["Ben", "OrangePlayers", { RL_SCORE: "500", RL_GOALS: "2" }],
      ["Lee", "OrangePlayers", { RL_SCORE: "90", RL_GOALS: "0" }],
    ]);
    expect(result.winners).toEqual(["Mark", "Dylan"]);
  });

  describe("when the reader saw a team marked as the winner", () => {
    /** Blue scored 3, orange 2, with the WINNER label on `winner`. */
    const labelled = (winner: string) =>
      match().map((team) => ({ ...team, ...(team.teamName === winner && { winner: true }) }));

    it("names that team", () => {
      expect(run(RL, labelled("BluePlayers"))).toMatchObject({
        status: SUCCESS,
        winners: ["Mark", "Dylan"],
      });
    });

    it("trusts the label over the goals, and asks for review when they disagree", () => {
      expect(run(RL, labelled("OrangePlayers"))).toMatchObject({
        status: REVIEW,
        winners: ["Ben", "Lee"],
      });
    });

    it("names nobody when no session player is on the winning team", () => {
      const fields = teams({
        BluePlayers: [["Rando", { Goals: "4" }]],
        OrangePlayers: [["Mark", { Goals: "1" }]],
      });
      fields[0].winner = true;

      expect(run(RL, fields)).toMatchObject({ status: REVIEW, winners: [] });
    });

    it("falls back to goals when more than one team is marked", () => {
      const fields = match().map((team) => ({ ...team, winner: true }));

      expect(run(RL, fields).winners).toEqual(["Mark", "Dylan"]);
    });
  });

  it("gives a tie on goals to the team listed first", () => {
    const result = run(
      RL,
      teams({ OrangePlayers: [["Ben", { Goals: "1" }]], BluePlayers: [["Mark", { Goals: "1" }]] }),
    );

    expect(result.winners).toEqual(["Ben"]);
  });

  it("ignores fields that are not a team", () => {
    const result = run(RL, [...match(), ...teams({ Spectators: [["Des", { Goals: "9" }]] })]);

    expect(result.players).toHaveLength(4);
  });

  it.each([
    ["a row that is not a session player", ["HAPPY CAMPER", { Goals: "0" }] as Row],
    ["an unreadable stat", ["Lee", { Goals: "Ø" }] as Row],
  ])("asks for review on %s", (_label, row) => {
    const result = run(RL, teams({ BluePlayers: [["Mark", { Goals: "1" }]], OrangePlayers: [row] }));

    expect(result.status).toBe(REVIEW);
    expect(result.winners).toEqual(["Mark"]);
  });

  it("treats a team with no rows as empty", () => {
    const fields = teams({ BluePlayers: [["Mark", { Goals: "1" }]] });
    fields.push({ teamName: "OrangePlayers", players: { type: "array" } as AnalyzedPlayersObj });

    expect(run(RL, fields)).toMatchObject({ status: SUCCESS, winners: ["Mark"] });
  });

  it.each([
    ["no row is a session player", teams({ BluePlayers: [["Rando", { Goals: "1" }]] })],
    ["it is handed a single array of rows", solo(["Mark", { rl_goals: "1" }])],
    ["the reader returned nothing", []],
  ])("fails when %s", (_label, fields) => {
    expect(() => run(RL, fields)).toThrow();
  });
});

describe("Marvel Rivals", () => {
  const match = () =>
    solo(
      ["Mark", { mr_kills: "12", mr_deaths: "5", mr_accuracy: "41%" }],
      ["Dylan", { mr_kills: "20", mr_deaths: "7", mr_accuracy: "38%" }],
    );

  it("maps rows and stats, reading accuracy without its percent sign", () => {
    const result = run(MR, match());

    expect(result.status).toBe(SUCCESS);
    expect(result.players.map((p) => [p.name, statsOf(p)])).toEqual([
      ["Mark", { MR_KILLS: "12", MR_DEATHS: "5", MR_ACCURACY: "41" }],
      ["Dylan", { MR_KILLS: "20", MR_DEATHS: "7", MR_ACCURACY: "38" }],
    ]);
  });

  it("names the player with the most kills as the winner", () => {
    expect(run(MR, match()).winners).toEqual(["Dylan"]);
  });

  it("gives a tie on kills to the first row", () => {
    const result = run(MR, solo(["Mark", { mr_kills: "9" }], ["Dylan", { mr_kills: "9" }]));

    expect(result.winners).toEqual(["Mark"]);
  });

  it("only names session players", () => {
    const result = run(MR, solo(["Mark", { mr_kills: "3" }], ["Rando", { mr_kills: "30" }]));

    expect(result.winners).toEqual(["Mark"]);
  });

  it("asks for review when a row is not a session player", () => {
    const result = run(MR, solo(["Mark", { mr_kills: "3" }], ["Rando", { mr_kills: "30" }]));

    expect(result.status).toBe(REVIEW);
    expect(result.players.map((p) => p.name)).toEqual(["Mark"]);
  });

  it.each([
    ["no rows", solo()],
    ["no player array at all", []],
  ])("asks for review, with no players, when the reader found %s", (_label, fields) => {
    expect(run(MR, fields)).toEqual({ status: REVIEW, players: [], winners: [] });
  });
});

describe("games without a processor", () => {
  it.each([4, 5, 999])("rejects game %d", (gameId) => {
    expect(() => run(gameId, solo(["Mark", {}]))).toThrow(`Invalid game id: ${gameId}`);
  });
});

describe("stat fields", () => {
  it("keeps a field with no stat config as an unknown stat", () => {
    const result = run(MK8, solo(["Mark", { mk8_place: "1", Ping: "40" }]));

    expect(result.players[0].stats).toEqual([
      { statId: 1, stat: "MK8_POS", statValue: "1" },
      { statId: 0, stat: "UNKNOWN_STAT", statValue: "40" },
    ]);
  });

  it("keeps the first value of a merged cell and asks for review", () => {
    const result = run(MR, solo(["Mark", { mr_kills: "14\n3" }]));

    expect(result.status).toBe(REVIEW);
    expect(statsOf(result.players[0])).toEqual({ MR_KILLS: "14" });
  });
});
