/**
 * `toLegacyAnalyzed` round-trip through the real Rocket League processor —
 * no processors are mocked here, so this also exercises the previously
 * untested `game-processor-utils` logic (name matching, stat validation,
 * team winner calculation).
 */
import { Player } from "@/generated/prisma/client";
import { toLegacyAnalyzed } from "./bridge";
import type { ExtractedScoreboard } from "./types";
import { RocketLeagueProcessor } from "@/lib/game-processors/RocketLeagueProcessor";
import { MarioKart8Processor } from "@/lib/game-processors/MarioKart8Processor";

const ROCKET_LEAGUE_GAME_ID = 2;
const MARIO_KART_8_GAME_ID = 1;

describe("toLegacyAnalyzed", () => {
  it("round-trips a TEAM scoreboard through RocketLeagueProcessor", () => {
    const sessionPlayers = [
      { playerId: 1, playerName: "Mark" },
      { playerId: 2, playerName: "Dylan" },
    ] as Player[];

    const scoreboard: ExtractedScoreboard = {
      teams: [
        {
          teamKey: "blue",
          players: [
            {
              name: "Mark",
              stats: {
                rl_score: 400,
                rl_goals: 3,
                rl_assists: 1,
                rl_saves: 0,
                rl_shots: 5,
              },
            },
          ],
        },
        {
          teamKey: "orange",
          players: [
            {
              name: "Dylan",
              stats: {
                rl_score: 200,
                rl_goals: 1,
                rl_assists: 0,
                rl_saves: 2,
                rl_shots: 3,
              },
            },
          ],
        },
      ],
    };

    const legacy = toLegacyAnalyzed(scoreboard, ROCKET_LEAGUE_GAME_ID);
    const { processedPlayers, reqCheckFlag } =
      RocketLeagueProcessor.processPlayers(legacy, sessionPlayers);

    expect(reqCheckFlag).toBe(false);
    expect(processedPlayers).toHaveLength(2);
    expect(processedPlayers.map((p) => p.name).sort()).toEqual([
      "Dylan",
      "Mark",
    ]);

    const winners = RocketLeagueProcessor.calculateWinners(processedPlayers);
    expect(winners.map((w) => w.name)).toEqual(["Mark"]);
  });

  it("drops a player who doesn't match the session roster and flags for review", () => {
    const sessionPlayers = [{ playerId: 1, playerName: "Mark" }] as Player[];

    const scoreboard: ExtractedScoreboard = {
      teams: [
        {
          teamKey: "blue",
          players: [
            { name: "Mark", stats: { rl_goals: 2 } },
            { name: "NotInThisSession", stats: { rl_goals: 0 } },
          ],
        },
        { teamKey: "orange", players: [] },
      ],
    };

    const legacy = toLegacyAnalyzed(scoreboard, ROCKET_LEAGUE_GAME_ID);
    const { processedPlayers, reqCheckFlag } =
      RocketLeagueProcessor.processPlayers(legacy, sessionPlayers);

    // The unmatched player is dropped, not returned as an empty placeholder.
    expect(processedPlayers).toHaveLength(1);
    expect(processedPlayers[0].name).toBe("Mark");
    expect(reqCheckFlag).toBe(true);
  });

  it("round-trips a SOLO scoreboard through MarioKart8Processor", () => {
    const sessionPlayers = [{ playerId: 1, playerName: "Mark" }] as Player[];

    const scoreboard: ExtractedScoreboard = {
      players: [{ name: "Mark", stats: { mk8_place: 1, mk8_day: 3 } }],
    };

    const legacy = toLegacyAnalyzed(scoreboard, MARIO_KART_8_GAME_ID);
    const { processedPlayers, reqCheckFlag } =
      MarioKart8Processor.processPlayers(legacy, sessionPlayers);

    expect(reqCheckFlag).toBe(false);
    expect(processedPlayers).toHaveLength(1);
    expect(processedPlayers[0].name).toBe("Mark");
  });
});
