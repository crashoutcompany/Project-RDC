import { Leaderboard } from "@/components/versus/leaderboard";
import type { LeaderboardEntry } from "../../_helpers/dashboard";

type SquadLeaderboardProps = {
  leaderboard: LeaderboardEntry[];
  gameName: string;
};

export function SquadLeaderboard({ leaderboard, gameName }: SquadLeaderboardProps) {
  return (
    <div className="border-vs-panel-2 bg-vs-panel h-full border-2 p-5">
      <div className="mb-4 flex items-center justify-between">
        <p className="vs-label text-vs-cream/80">Leaderboard</p>
        <span className="text-vs-cream/70 text-sm">{gameName}</span>
      </div>
      <Leaderboard
        entries={leaderboard.slice(0, 5).map((e) => ({ player: e.player, wins: e.matchWins }))}
      />
    </div>
  );
}
