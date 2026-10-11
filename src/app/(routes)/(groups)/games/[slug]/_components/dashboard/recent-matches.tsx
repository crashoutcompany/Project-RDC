import Image from "next/image";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { RecentMatchData } from "../../_helpers/dashboard";

type RecentMatchesProps = {
  matches: RecentMatchData[];
};

const PLACE_LABELS: Record<number, string> = {
  1: "1st Place",
  2: "2nd Place",
  3: "3rd Place",
};

const PLACE_COLORS: Record<number, string> = {
  1: "border-l-yellow-500",
  2: "border-l-gray-400",
  3: "border-l-amber-700",
};

/**
 * Renders the "Recent Matches" section showing the last 2 sessions
 * with top placements per session.
 *
 * @param props - Contains an array of recent match data.
 * @returns The recent matches JSX element.
 */
export function RecentMatches({ matches }: RecentMatchesProps) {
  if (matches.length === 0) return null;

  return (
    <div>
      <div className="mb-4">
        <h2 className="text-lg font-bold italic uppercase tracking-wide">
          Recent Sessions
        </h2>
        <p className="text-muted-foreground text-xs">
          Latest session standings
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {matches.map((match) => (
          <RecentMatchCard key={match.sessionName} match={match} />
        ))}
      </div>
    </div>
  );
}

function RecentMatchCard({ match }: { match: RecentMatchData }) {
  return (
    <Card className="overflow-hidden">
      <div className="relative h-32">
        <Image
          src={match.thumbnail}
          alt={match.sessionName}
          fill
          sizes="(max-width: 768px) 100vw, 50vw"
          className="object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
        <div className="absolute bottom-3 left-4">
          <h3 className="text-sm font-bold text-white">{match.sessionName}</h3>
          <p className="text-xs text-white/70">
            {match.gameName} &middot; {match.date}
          </p>
        </div>
      </div>
      <CardContent className="p-3">
        {match.placements.length === 0 ? (
          <p className="text-muted-foreground text-xs">No placement data.</p>
        ) : (
          <div className="space-y-1.5">
            {match.placements.map((placement) => (
              <div
                key={placement.place}
                className={`flex items-center justify-between rounded border-l-4 px-3 py-1.5 ${
                  PLACE_COLORS[placement.place] || "border-l-muted"
                } bg-muted/50`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground text-xs font-medium uppercase">
                    {PLACE_LABELS[placement.place] || `${placement.place}th`}
                  </span>
                  <span className="text-sm font-bold uppercase">
                    {placement.playerName}
                  </span>
                </div>
                <span className="text-chart-1 text-xs font-bold">
                  {placement.points} pts
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
