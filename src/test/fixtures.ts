import type { FormValues } from "@/app/(routes)/admin/_utils/form-helpers";
import { StatName } from "@/lib/stat-names";

/** Minimal schema-valid Call of Duty submission: one set, one match, two stats. */
export const codSessionForm = (): FormValues => ({
  game: "Call of Duty",
  sessionName: "CoD Night",
  sessionUrl: "https://www.youtube.com/watch?v=video123456",
  thumbnail: "https://example.com/thumbnail.jpg",
  date: new Date("2023-10-01"),
  videoId: "video123456",
  players: [{ playerId: 1, playerName: "Ben" }],
  sets: [
    {
      setId: 1,
      setWinners: [{ playerId: 1, playerName: "Ben" }],
      matches: [
        {
          matchWinners: [{ playerId: 1, playerName: "Ben" }],
          playerSessions: [
            {
              playerId: 1,
              playerSessionName: "Ben",
              playerStats: [
                { statId: "1", stat: StatName.COD_SCORE, statValue: "100" },
                { statId: "2", stat: StatName.COD_POS, statValue: "1" },
              ],
            },
          ],
        },
      ],
    },
  ],
});

/** Schema-valid Mario Kart 8 submission for an existing session (id 1). */
export const mk8SessionForm = (
  sets: FormValues["sets"] = [mk8Set(1, { playerId: 1, playerName: "Mark" })],
): FormValues => ({
  sessionId: 1,
  game: "Mario Kart 8",
  sessionName: "MK8 Night",
  sessionUrl: "https://www.youtube.com/watch?v=mk8video123",
  thumbnail: "https://example.com/mk8.jpg",
  videoId: "mk8video123",
  date: new Date("2025-01-01"),
  players: [{ playerId: 1, playerName: "Mark" }],
  sets,
});

export const mk8Set = (
  setId: number,
  winner: FormValues["players"][number],
): FormValues["sets"][number] => ({
  setId,
  setWinners: [winner],
  matches: [
    {
      matchWinners: [winner],
      playerSessions: [
        {
          playerId: winner.playerId,
          playerSessionName: winner.playerName,
          playerStats: [{ statId: 1, stat: StatName.MK8_POS, statValue: "1" }],
        },
      ],
    },
  ],
});
