import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ProcessedSet } from "@/lib/mvp/process-sets";

type RLPlayerStats = {
  player: string;
  score: number;
  goals: number;
  assists: number;
  saves: number;
  shots: number;
};

type MarioKartPlayerStats = {
  player: string;
  position: number;
};

type CoDPlayerStats = {
  player: string;
  kills: number;
  deaths: number;
  assists: number;
};

type PlayerStats = RLPlayerStats | MarioKartPlayerStats | CoDPlayerStats;

type SetDataProps = {
  set: ProcessedSet;
  setIndex: number;
  game: string | undefined;
};

export const SetData = ({ set, setIndex, game }: SetDataProps) => {
  const renderGameStats = (match: PlayerStats[], gameForStats?: string) => {
    const currentGame = gameForStats || game;
    switch (currentGame) {
      case "Rocket League":
        return (
          <div className="flex gap-10 text-white">
            <StatsTable
              players={match.slice(0, 3)}
              bgColor="bg-blue-700"
              teamName="Blue Team"
              game={game}
            />
            <StatsTable
              players={match.slice(3)}
              bgColor="bg-orange-700"
              teamName="Orange Team"
              game={game}
            />
          </div>
        );
      case "Mario Kart 8":
        return (
          <div className="text-white">
            <StatsTable
              players={match}
              bgColor="bg-blue-700"
              teamName="Race Results"
              game={game}
            />
          </div>
        );
      case "Call of Duty":
        return (
          <div className="text-white">
            <StatsTable
              players={match}
              bgColor="bg-blue-700"
              teamName="Match Stats"
              game={game}
            />
          </div>
        );
      default:
        return (
          <div className="text-white">
            <StatsTable players={match} bgColor="bg-blue-700" game={game} />
          </div>
        );
    }
  };

  const winners = set.setWinners;
  const winnerText = winners.length > 1 ? "Winners" : "Winner";

  return (
    <div className="mb-6">
      <div className="text-chart-4 text-2xl font-bold">Set {setIndex + 1}</div>
      <div className="text-muted-foreground my-2 text-sm">
        {winnerText}: {winners.join(", ") || "No winners recorded"}
      </div>
      {set.matches.map((match, matchIndex) => (
        <div className="mb-4" key={matchIndex}>
          <div>Match {matchIndex + 1}</div>
          <Separator className="my-2" />
          <span className="text-muted-foreground text-sm">
            {game === "Rocket League" ? "Teams" : "Results"}
          </span>
          {renderGameStats(match.players, game)}
        </div>
      ))}
    </div>
  );
};
export default SetData;

const StatsTable = ({
  players,
  bgColor,
  teamName,
  game,
}: {
  players: PlayerStats[];
  bgColor: string;
  teamName?: string;
  game?: string;
}) => {
  if (!players.length) return null;
  const isRocketLeague = (p: PlayerStats): p is RLPlayerStats => "score" in p;
  const isMarioKart = (p: PlayerStats): p is MarioKartPlayerStats =>
    "position" in p;
  const isCoDStats = (p: PlayerStats): p is CoDPlayerStats => "kills" in p;

  const firstPlayer = players[0];
  const shouldHighlightFirst = game !== "Rocket League";

  const getRowClass = (index: number, baseColor: string) => {
    if (!shouldHighlightFirst || index !== 0) return baseColor;
    return `${baseColor} bg-amber-600`;
  };

  return (
    <Table className="max-w-sm">
      {teamName && (
        <TableCaption className="mb-2 text-white">{teamName}</TableCaption>
      )}
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className="text-white">Player</TableHead>
          {isRocketLeague(firstPlayer) ? (
            <>
              <TableHead className="text-white">Score</TableHead>
              <TableHead className="text-white">Goals</TableHead>
              <TableHead className="text-white">Assists</TableHead>
              <TableHead className="text-white">Saves</TableHead>
              <TableHead className="text-white">Shots</TableHead>
            </>
          ) : isMarioKart(firstPlayer) ? (
            <TableHead className="text-white">Position</TableHead>
          ) : isCoDStats(firstPlayer) ? (
            <>
              <TableHead className="text-white">K</TableHead>
              <TableHead className="text-white">D</TableHead>
              <TableHead className="text-white">A</TableHead>
            </>
          ) : null}
        </TableRow>
      </TableHeader>
      <TableBody>
        {players.map((ps, index) => (
          <TableRow
            key={ps.player}
            className={`hover:bg-transparent ${getRowClass(index, bgColor)}`}
          >
            <TableCell>{ps.player}</TableCell>
            {isRocketLeague(ps) ? (
              <>
                <TableCell>{ps.score}</TableCell>
                <TableCell>{ps.goals}</TableCell>
                <TableCell>{ps.assists}</TableCell>
                <TableCell>{ps.saves}</TableCell>
                <TableCell>{ps.shots}</TableCell>
              </>
            ) : isMarioKart(ps) ? (
              <TableCell>{ps.position}</TableCell>
            ) : isCoDStats(ps) ? (
              <>
                <TableCell>{ps.kills}</TableCell>
                <TableCell>{ps.deaths}</TableCell>
                <TableCell>{ps.assists}</TableCell>
              </>
            ) : null}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
};
