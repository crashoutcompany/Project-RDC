import Image from "next/image";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { RecentMatchData } from "../../_helpers/dashboard";

type RecentMatchesProps = {
  matches: RecentMatchData[];
  gameName: string;
};

const placeholder = (gameName: string): RecentMatchData => ({
  sessionName: "[Session title]",
  thumbnail: "",
  sessionUrl: "",
  date: "[date]",
  gameName,
  placements: [1, 2, 3].map((place) => ({ place, playerName: "???", points: NaN })),
});

const PLACE_LABELS: Record<number, string> = {
  1: "1st Place",
  2: "2nd Place",
  3: "3rd Place",
};

const PLACE_COLORS: Record<number, string> = {
  1: "border-l-ac-gold",
  2: "border-l-[#c9c6d1]",
  3: "border-l-[#d0782b]",
};

/**
 * Renders the "Recent Matches" section showing the last 2 sessions
 * with top placements per session.
 *
 * @param props - Contains an array of recent match data.
 * @returns The recent matches JSX element.
 */
export function RecentMatches({ matches, gameName }: RecentMatchesProps) {
  const cards = matches.length ? matches : [placeholder(gameName), placeholder(gameName)];

  return (
    <div>
      <div className="mb-4">
        <h2 className="ac-title text-ac-cream text-2xl">
          Recent <span className="text-ac-red">sessions</span>
        </h2>
        <p className="text-ac-cream/70 text-sm">
          Latest session standings
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {cards.map((match, i) => (
          <RecentMatchCard key={`${match.sessionName}-${i}`} match={match} />
        ))}
      </div>
    </div>
  );
}

function RecentMatchCard({ match }: { match: RecentMatchData }) {
  return (
    <Card className="border-ac-panel-2 overflow-hidden border-2 py-0">
      <div className="relative h-28 bg-[repeating-linear-gradient(-45deg,#1d1b23_0_10px,#16141b_10px_20px)]">
        {match.thumbnail ? (
          <Image
            src={match.thumbnail}
            alt={match.sessionName}
            fill
            sizes="(max-width: 768px) 100vw, 50vw"
            className="object-cover"
          />
        ) : null}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
        <div className="absolute bottom-3 left-4">
          <h3 className="ac-title text-ac-cream text-sm">{match.sessionName}</h3>
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
                className={`flex items-center justify-between border-l-4 px-3 py-1.5 ${
                  PLACE_COLORS[placement.place] || "border-l-muted"
                } bg-ac-ink`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground text-xs font-medium uppercase">
                    {PLACE_LABELS[placement.place] || `${placement.place}th`}
                  </span>
                  <span className="ac-title text-ac-cream text-sm">
                    {placement.playerName}
                  </span>
                </div>
                <span className="ac-title text-ac-gold text-sm">
                  {Number.isNaN(placement.points) ? "--" : placement.points} pts
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
