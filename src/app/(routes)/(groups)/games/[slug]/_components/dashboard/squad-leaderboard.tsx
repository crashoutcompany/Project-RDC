import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { LeaderboardEntry } from "../../_helpers/dashboard";

type SquadLeaderboardProps = {
  leaderboard: LeaderboardEntry[];
  gameName: string;
};

/**
 * Renders a leaderboard card showing player rankings by total match wins.
 * Designed to be generic — works for any game.
 *
 * @param props - Contains the leaderboard entries and gameName.
 * @returns A card JSX element with the leaderboard.
 */
export function SquadLeaderboard({ leaderboard, gameName }: SquadLeaderboardProps) {
  return (
    <Card className="flex h-full flex-col overflow-hidden">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-muted-foreground text-xs font-medium uppercase tracking-wider">
          Leaderboard
        </CardTitle>
        <span className="text-muted-foreground text-xs">{gameName}</span>
      </CardHeader>
      <CardContent className="flex-1 pt-0">
        {leaderboard.length === 0 ? (
          <p className="text-muted-foreground text-sm">No data available.</p>
        ) : (
          <div className="space-y-2">
            {leaderboard.map((entry, index) => (
              <div
                key={entry.player}
                className="flex items-center justify-between rounded-md px-2 py-1.5 transition-colors hover:bg-muted/50"
              >
                <div className="flex items-center gap-3">
                  <RankIndicator rank={index + 1} />
                  <span className="text-sm font-semibold uppercase">
                    {entry.player}
                  </span>
                </div>
                <span className="text-chart-1 text-sm font-bold">
                  {entry.matchWins.toLocaleString()}
                  <span className="text-muted-foreground ml-1 text-xs font-normal">
                    W
                  </span>
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function RankIndicator({ rank }: { rank: number }) {
  const colors: Record<number, string> = {
    1: "bg-yellow-500 text-black",
    2: "bg-gray-400 text-black",
    3: "bg-amber-700 text-white",
  };

  return (
    <span
      className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
        colors[rank] || "bg-muted text-muted-foreground"
      }`}
    >
      {rank}
    </span>
  );
}
