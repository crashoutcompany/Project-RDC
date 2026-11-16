import { calcWinsPerPlayer } from "../_helpers/stats";

type Game = Parameters<typeof calcWinsPerPlayer>[0];

const MARK = { playerId: 1, playerName: "Mark" };
const DYLAN = { playerId: 2, playerName: "Dylan" };
const BEN = { playerId: 3, playerName: "Ben" };

type Winners = { playerId: number; playerName: string }[];

const session = (dayWinners: Winners, sets: { setWinners: Winners; matches: Winners[] }[]) => ({
  sessionId: 1,
  sessionName: "Night",
  sessionUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  dayWinners,
  sets: sets.map((set, setId) => ({
    setId,
    setWinners: set.setWinners,
    matches: set.matches.map((matchWinners, matchId) => ({ matchId, matchWinners })),
  })),
});

describe("calcWinsPerPlayer", () => {
  it("counts match, set and day wins per player across sessions", () => {
    const game = {
      sessions: [
        session([MARK], [
          { setWinners: [MARK], matches: [[MARK], [DYLAN], [MARK]] },
          { setWinners: [DYLAN], matches: [[DYLAN], [DYLAN]] },
        ]),
        session([MARK, DYLAN], [{ setWinners: [MARK, DYLAN], matches: [[MARK, DYLAN]] }]),
      ],
    } as Game;

    expect(calcWinsPerPlayer(game)).toEqual([
      { player: "Mark", matchWins: 3, setWins: 2, days: 2 },
      { player: "Dylan", matchWins: 4, setWins: 2, days: 1 },
    ]);
  });

  it("includes a player whose only win is the day", () => {
    const game = {
      sessions: [session([BEN], [{ setWinners: [MARK], matches: [[MARK]] }])],
    } as Game;

    expect(calcWinsPerPlayer(game)).toEqual([
      { player: "Mark", matchWins: 1, setWins: 1, days: 0 },
      { player: "Ben", matchWins: 0, setWins: 0, days: 1 },
    ]);
  });

  it("gives days of zero when no day winner was recorded", () => {
    const game = { sessions: [session([], [{ setWinners: [MARK], matches: [[MARK]] }])] } as Game;

    expect(calcWinsPerPlayer(game)).toEqual([
      { player: "Mark", matchWins: 1, setWins: 1, days: 0 },
    ]);
  });
});
