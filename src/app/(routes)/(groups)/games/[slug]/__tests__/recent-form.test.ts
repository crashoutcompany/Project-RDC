import { calcRecentForm } from "../_helpers/stats";

type Game = Parameters<typeof calcRecentForm>[0];

const MARK = { playerId: 1, playerName: "Mark" };
const DYLAN = { playerId: 2, playerName: "Dylan" };
const BEN = { playerId: 3, playerName: "Ben" };

const session = (
  sessionId: number,
  date: string,
  dayWinners: { playerId: number; playerName: string }[],
) => ({
  sessionId,
  sessionName: `Night ${sessionId}`,
  sessionUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  date: new Date(date),
  dayWinners,
  sets: [],
});

describe("calcRecentForm", () => {
  it("keeps the 5 newest sessions, newest first", () => {
    const game = {
      sessions: [
        session(1, "2026-01-01", [MARK]),
        session(2, "2026-01-08", [DYLAN]),
        session(3, "2026-01-15", [MARK]),
        session(4, "2026-01-22", [BEN]),
        session(5, "2026-01-29", [MARK]),
        session(6, "2026-02-05", [DYLAN]),
      ],
    } as Game;

    const { sessions } = calcRecentForm(game);

    expect(sessions.map((s) => s.sessionId)).toEqual([6, 5, 4, 3, 2]);
    expect(sessions[0]).toMatchObject({ sessionName: "Night 6", dayWinners: ["Dylan"] });
  });

  it("tallies days won over that window only, most first", () => {
    const game = {
      sessions: [
        session(1, "2026-01-01", [BEN]), // falls outside the last 5
        session(2, "2026-01-08", [DYLAN]),
        session(3, "2026-01-15", [MARK]),
        session(4, "2026-01-22", [MARK, DYLAN]),
        session(5, "2026-01-29", [MARK]),
        session(6, "2026-02-05", []),
      ],
    } as Game;

    expect(calcRecentForm(game).daysWon).toEqual([
      { player: "Mark", days: 3 },
      { player: "Dylan", days: 2 },
    ]);
  });

  it("handles a game with fewer than 5 sessions or none", () => {
    const one = { sessions: [session(1, "2026-01-01", [])] } as Game;
    expect(calcRecentForm(one)).toEqual({
      sessions: [
        { sessionId: 1, sessionName: "Night 1", date: new Date("2026-01-01"), dayWinners: [] },
      ],
      daysWon: [],
    });
    expect(calcRecentForm({ sessions: [] } as unknown as Game)).toEqual({
      sessions: [],
      daysWon: [],
    });
  });
});
