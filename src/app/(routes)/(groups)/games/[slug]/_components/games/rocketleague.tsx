import { ChartConfig } from "@/components/ui/chart";
import { ChartGrid, CustomChart } from "../charts";
import { TabbedChart } from "../tabbed-chart";
import { getAvgAndSum } from "../../_helpers/stats";
import { Members } from "../../page";

const RocketLeague = async ({
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
        const { goals, assists, saves, score, day } = await getAvgAndSum(
          member.playerId,
          ["RL_GOALS", "RL_ASSISTS", "RL_SAVES", "RL_SCORE", "RL_DAY"],
        );
        return {
          ...member,
          goals: { sum: Number(goals?.sum), avg: Number(goals?.avg) },
          assists: { sum: Number(assists?.sum), avg: Number(assists?.avg) },
          saves: { sum: Number(saves?.sum), avg: Number(saves?.avg) },
          score: { sum: Number(score?.sum), avg: Number(score?.avg) },
          day: { sum: Number(day?.sum), avg: Number(day?.avg) },
        };
      } catch (error) {
        // TODO Do something if one of the requests fail.
        console.error(error);
        return {
          ...member,
          goals: { sum: -1, avg: -1 },
          assists: { sum: -1, avg: -1 },
          saves: { sum: -1, avg: -1 },
          score: { sum: -1, avg: -1 },
          day: { sum: -1, avg: -1 },
        };
      }
    }),
  );
  membersMap = membersMap.filter((d) => d?.score.sum > 0);

  const config = {
    player: { label: "Player" },
    matchWins: { label: "Matches won" },
    setWins: { label: "Sets won" },
    days: { label: "Days won" },
  } satisfies ChartConfig;

  const sumConfig = {
    playerName: { label: "Player" },
    ["goals.sum"]: { label: "Total Goals" },
    ["score.avg"]: { label: "Avg Score" },
    ["assists.sum"]: { label: "Total Assists" },
    ["days.sum"]: { label: "Total Days" },
    ["saves.sum"]: { label: "Total Saves" },
  } satisfies ChartConfig;

  return (
    <ChartGrid>
      <CustomChart
        data={membersMap}
        nameKey="playerName"
        dataKey="goals.sum"
        title="Goals Per Player"
        description="Goals scored all time"
        config={sumConfig}
        ignoreWarnings
      />
      <CustomChart
        data={membersMap}
        nameKey="playerName"
        dataKey="saves.sum"
        title="Saves Per Player"
        description="Shots saved all time"
        config={sumConfig}
        ignoreWarnings
      />
      <CustomChart
        data={membersMap}
        nameKey="playerName"
        dataKey="assists.sum"
        title="Assists All Time"
        description="All time Assists"
        config={sumConfig}
        ignoreWarnings
      />
      <CustomChart
        data={membersMap}
        nameKey="playerName"
        dataKey="score.avg"
        title="Average Score"
        description="Average Score"
        config={sumConfig}
        ignoreWarnings
      />
      {/* <CustomChart
        // @ts-ignore
        data={membersMap}
        nameKey="playerName"
        dataKey="days.sum"
        title="Days Won"
        description="The amount of days each member has won."
        config={sumConfig}
        ignoreWarnings // No days in db currently
      /> */}
      <TabbedChart
        chartConfig={config}
        chartData={winsPerPlayer}
        gameName={game.gameName}
      />
    </ChartGrid>
  );
};
export default RocketLeague;
