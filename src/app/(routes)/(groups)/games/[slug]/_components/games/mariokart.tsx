import { ChartConfig } from "@/components/ui/chart";
import { ChartGrid, CustomChart } from "../charts";
import { TabbedChart } from "../tabbed-chart";
import { getAvgAndSum } from "../../_helpers/stats";
import { Members } from "../../page";

const MarioKart = async ({
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
        const { pos, day } = await getAvgAndSum(member.playerId, [
          "MK8_POS",
          "MK8_DAY",
        ]);
        return {
          ...member,
          pos: { sum: Number(pos?.sum), avg: Number(pos?.avg) },
          day: { sum: Number(day?.sum), avg: Number(day?.avg) },
        };
      } catch (error) {
        console.error(error);
        return {
          ...member,
          pos: { sum: -1, avg: -1 },
          day: { sum: -1, avg: -1 },
        };
      }
    }),
  );
  membersMap = membersMap.filter((d) => d?.pos.sum > 0);

  const config = {
    player: { label: "Player" },
    matchWins: { label: "Races won" },
    setWins: { label: "Sets won" },
    days: { label: "Days won" },
  } satisfies ChartConfig;

  const avgConfig = {
    playerName: { label: "Player" },
    ["pos.avg"]: { label: "Avg Position" },
    ["day.sum"]: { label: "Total Days Won" },
  } satisfies ChartConfig;

  return (
    <ChartGrid>
      <CustomChart
        data={membersMap}
        nameKey="playerName"
        dataKey="pos.avg"
        title="Average Position"
        description="Average race position all time"
        config={avgConfig}
        ignoreWarnings
      />
      <TabbedChart
        chartConfig={config}
        chartData={winsPerPlayer as unknown[]}
        gameName={game.gameName}
      />
    </ChartGrid>
  );
};
export default MarioKart;
