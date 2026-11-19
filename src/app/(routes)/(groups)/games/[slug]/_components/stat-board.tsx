import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { ChartConfig } from "@/components/ui/chart";
import { getStatTotalsByGame } from "prisma/lib/games";
import { buildStatBoard, type StatBoardConfig } from "../_helpers/stat-board";
import type { Members } from "../page";
import { ChartGrid, CustomChart } from "./charts";
import { TabbedChart } from "./tabbed-chart";

/**
 * The all-time stat charts for one game, driven by its `STAT_BOARDS` entry
 * and a single grouped query. If that query fails the wins chart still
 * renders, next to a notice instead of charts full of zeros.
 */
export async function StatBoard({
  board,
  game,
  members,
  winsPerPlayer,
}: {
  board: StatBoardConfig;
  game: { gameId: number; gameName: string };
  members: Members;
  winsPerPlayer: unknown[];
}) {
  const totals = await getStatTotalsByGame(game.gameId);

  const winsConfig = {
    player: { label: "Player" },
    matchWins: { label: board.matchWinsLabel ?? "Matches won" },
    setWins: { label: "Sets won" },
    days: { label: "Days won" },
  } satisfies ChartConfig;
  const winsChart = (
    <TabbedChart
      chartConfig={winsConfig}
      chartData={winsPerPlayer}
      gameName={game.gameName}
    />
  );

  if (!totals.success || !totals.data)
    return (
      <ChartGrid>
        <Card className="w-full" role="alert">
          <CardHeader>
            <CardTitle>Stats unavailable</CardTitle>
            <CardDescription>
              We couldn&apos;t load the {game.gameName} stat charts. Please try
              again in a moment.
            </CardDescription>
          </CardHeader>
        </Card>
        {winsChart}
      </ChartGrid>
    );

  const { rows, charts, config } = buildStatBoard(board, members, totals.data);

  if (rows.length === 0 && board.emptyMessage)
    return (
      <p className="ac-title text-ac-cream text-xl">{board.emptyMessage}</p>
    );

  return (
    <ChartGrid>
      {charts.map((chart) => (
        <CustomChart
          key={chart.dataKey}
          data={rows}
          nameKey="playerName"
          dataKey={chart.dataKey}
          title={chart.title}
          description={chart.description}
          config={config}
          ignoreWarnings
        />
      ))}
      {winsChart}
    </ChartGrid>
  );
}
