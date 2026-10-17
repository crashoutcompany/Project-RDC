import { ChartConfig } from "@/components/ui/chart";
import { ChartGrid, CustomChart } from "../charts";
import { TabbedChart } from "../tabbed-chart";
import { getAvgAndSum } from "../../_helpers/stats";
import { Members } from "../../page";

const LethalCompany = async ({
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
        const { deaths } = await getAvgAndSum(member.playerId, ["LC_DEATHS"]);
        return {
          ...member,
          deaths: { sum: Number(deaths?.sum), avg: Number(deaths?.avg) },
        };
      } catch (error) {
        console.error(error);
        return {
          ...member,
          deaths: { sum: -1, avg: -1 },
        };
      }
    }),
  );
  membersMap = membersMap.filter((d) => d?.deaths.sum > 0);

  const config = {
    player: { label: "Player" },
    matchWins: { label: "Matches won" },
    setWins: { label: "Sets won" },
    days: { label: "Days won" },
  } satisfies ChartConfig;

  const sumConfig = {
    playerName: { label: "Player" },
    ["deaths.sum"]: { label: "Total Deaths" },
  } satisfies ChartConfig;

  return (
    <ChartGrid>
      <CustomChart
        data={membersMap}
        nameKey="playerName"
        dataKey="deaths.sum"
        title="Deaths Per Player"
        description="Deaths all time"
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
export default LethalCompany;
