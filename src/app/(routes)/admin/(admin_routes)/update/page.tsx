import { H1, H2 } from "@/components/headings";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getAllGameStats, getAllGames } from "prisma/lib/games";
import { getAllMembers } from "prisma/lib/members";
import { addGame, addPlayer, addGameStat } from "@/app/actions/adminAction";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type DbTableProps<T extends Record<string, unknown>> = {
  data: T[];
  columns: (keyof T)[];
};

function DbTable<T extends Record<string, unknown>>({
  data,
  columns,
}: DbTableProps<T>) {
  if (data.length === 0) {
    return <div>No data available</div>;
  }
  return (
    <Table className="w-1/2">
      <TableHeader>
        <TableRow>
          {columns.map((column) => (
            <TableHead key={String(column)}>{String(column)}</TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.map((row, rowIndex) => (
          <TableRow key={rowIndex}>
            {columns.map((column) => (
              <TableCell key={String(column)}>
                {String(row[column] ?? "N/A")}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export default async function Page() {
  const [statsQuery, gamesQuery, playersQuery] = await Promise.all([
    getAllGameStats(),
    getAllGames(),
    getAllMembers(),
  ]);

  const stats = statsQuery.success ? statsQuery.data : [];
  const games = gamesQuery.success ? gamesQuery.data : [];
  const players = playersQuery.success ? playersQuery.data : [];

  return (
    <div className="space-y-4">
      <H1>Update Database</H1>

      <div>
        <H2>Games</H2>
        <form
          action={async (fd) => {
            "use server";
            await addGame(fd);
          }}
          className="flex items-center gap-2"
        >
          <Input
            className="max-w-sm"
            name="gameName"
            placeholder="Game Name"
            required
          />
          <Button type="submit">Add Game</Button>
        </form>
        <DbTable data={games} columns={["gameId", "gameName"]} />
      </div>

      <div>
        <H2>Players</H2>
        <form
          action={async (fd) => {
            "use server";
            await addPlayer(fd);
          }}
          className="flex items-center gap-2"
        >
          <Input
            className="max-w-sm"
            name="playerName"
            placeholder="Player Name"
            required
          />
          <Button type="submit">Add Player</Button>
        </form>
        <DbTable data={players} columns={["playerId", "playerName"]} />
      </div>

      <div>
        <H2>Game Stats</H2>
        <form
          action={async (fd) => {
            "use server";
            await addGameStat(fd);
          }}
          className="flex items-center gap-2"
        >
          <Input
            className="max-w-sm"
            name="statName"
            placeholder="Stat Name"
            required
          />
          <Select name="gameId" required>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Select a game" />
            </SelectTrigger>
            <SelectContent>
              {games.map((game) => (
                <SelectItem key={game.gameId} value={String(game.gameId)}>
                  {game.gameName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select name="type" required>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Select a type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="INT">INT</SelectItem>
              <SelectItem value="STRING">STRING</SelectItem>
            </SelectContent>
          </Select>
          <Button type="submit">Add Game Stat</Button>
        </form>
        <DbTable data={stats} columns={["statId", "statName"]} />
      </div>
    </div>
  );
}
