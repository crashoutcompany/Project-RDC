import { ChartConfig } from "@/components/ui/chart";
import { ChartGrid, CustomChart } from "../charts";
import { TabbedChart } from "../tabbed-chart";
import { getAvgAndSum } from "../../_helpers/stats";
import { Members } from "../../page";

const Speedrunners = async ({
  game,
  members,
  winsPerPlayer,
}: {
  game: { gameId: number; gameName: string };
  members: Members;
  winsPerPlayer: unknown[];
}) => {
  let membersMap = await Promise.all(
    members.map(async (member) => {
      try {
        const { wins, sets, pos } = await getAvgAndSum(member.playerId, [
          "SR_WINS",
          "SR_SETS",
          "SR_POS",
        ]);
        return {
          ...member,
          wins: { sum: Number(wins?.sum), avg: Number(wins?.avg) },
          sets: { sum: Number(sets?.sum), avg: Number(sets?.avg) },
          pos: { sum: Number(pos?.sum), avg: Number(pos?.avg) },
        };
      } catch (error) {
        console.error(error);
        return {
          ...member,
          wins: { sum: -1, avg: -1 },
          sets: { sum: -1, avg: -1 },
          pos: { sum: -1, avg: -1 },
        };
      }
    }),
  );
  membersMap = membersMap.filter((d) => d?.wins.sum > 0);

  const config = {
    player: { label: "Player" },
    matchWins: { label: "Races won" },
    setWins: { label: "Sets won" },
    days: { label: "Days won" },
  } satisfies ChartConfig;

  const sumConfig = {
    playerName: { label: "Player" },
    ["wins.sum"]: { label: "Total Wins" },
    ["sets.sum"]: { label: "Total Sets" },
    ["pos.avg"]: { label: "Avg Position" },
  } satisfies ChartConfig;

  return (
    <ChartGrid>
      <CustomChart
        data={membersMap}
        nameKey="playerName"
        dataKey="wins.sum"
        title="Wins Per Player"
        description="Wins all time"
        config={sumConfig}
        ignoreWarnings
      />
      <CustomChart
        data={membersMap}
        nameKey="playerName"
        dataKey="sets.sum"
        title="Sets Per Player"
        description="Sets all time"
        config={sumConfig}
        ignoreWarnings
      />
      <CustomChart
        data={membersMap}
        nameKey="playerName"
        dataKey="pos.avg"
        title="Average Position"
        description="Average Position"
        config={sumConfig}
        ignoreWarnings
      />
      <TabbedChart
        chartConfig={config}
        chartData={winsPerPlayer}
        gameName={game.gameName}
      />
    </ChartGrid>
  );
};
export default Speedrunners;
