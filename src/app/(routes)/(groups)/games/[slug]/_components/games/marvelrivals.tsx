import { ChartConfig } from "@/components/ui/chart";
import { ChartGrid, CustomChart } from "../charts";
import { TabbedChart } from "../tabbed-chart";
import { getAvgAndSum } from "../../_helpers/stats";
import { Members } from "../../page";
import { killDeathRatio } from "@/lib/rdc-stats";

const MarvelRivals = async ({
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
        // MR_ACCURACY is left out: it can be fractional and getSumOfStat casts to INTEGER.
        const {
          kills,
          deaths,
          assists,
          dmg,
          dmg_blocked,
          healing,
          triple_kill,
          quadra_kill,
          penta_kill,
          hexa_kill,
        } = await getAvgAndSum(member.playerId, [
          "MR_KILLS",
          "MR_DEATHS",
          "MR_ASSISTS",
          "MR_DMG",
          "MR_DMG_BLOCKED",
          "MR_HEALING",
          "MR_TRIPLE_KILL",
          "MR_QUADRA_KILL",
          "MR_PENTA_KILL",
          "MR_HEXA_KILL",
        ]);
        const multiKills =
          Number(triple_kill?.sum) +
          Number(quadra_kill?.sum) +
          Number(penta_kill?.sum) +
          Number(hexa_kill?.sum);
        return {
          ...member,
          kills: { sum: Number(kills?.sum), avg: Number(kills?.avg) },
          deaths: { sum: Number(deaths?.sum), avg: Number(deaths?.avg) },
          assists: { sum: Number(assists?.sum), avg: Number(assists?.avg) },
          kd: killDeathRatio(Number(kills?.sum), Number(deaths?.sum)),
          dmg: { sum: Number(dmg?.sum), avg: Number(dmg?.avg) },
          dmg_blocked: {
            sum: Number(dmg_blocked?.sum),
            avg: Number(dmg_blocked?.avg),
          },
          healing: { sum: Number(healing?.sum), avg: Number(healing?.avg) },
          multiKills: { sum: multiKills },
        };
      } catch (error) {
        console.error(error);
        return {
          ...member,
          kills: { sum: -1, avg: -1 },
          deaths: { sum: -1, avg: -1 },
          assists: { sum: -1, avg: -1 },
          kd: -1,
          dmg: { sum: -1, avg: -1 },
          dmg_blocked: { sum: -1, avg: -1 },
          healing: { sum: -1, avg: -1 },
          multiKills: { sum: -1 },
        };
      }
    }),
  );
  membersMap = membersMap.filter(
    (d) => d.kills.sum + d.deaths.sum + d.assists.sum > 0,
  );

  if (membersMap.length === 0)
    return (
      <p className="ac-title text-ac-cream text-xl">
        No Marvel Rivals stats yet
      </p>
    );

  const config = {
    player: { label: "Player" },
    matchWins: { label: "Matches won" },
    setWins: { label: "Sets won" },
    days: { label: "Days won" },
  } satisfies ChartConfig;

  const sumConfig = {
    playerName: { label: "Player" },
    ["kills.sum"]: { label: "Total Kills" },
    ["deaths.sum"]: { label: "Total Deaths" },
    ["assists.sum"]: { label: "Total Assists" },
    kd: { label: "K/D" },
    ["dmg.sum"]: { label: "Total Damage" },
    ["dmg_blocked.sum"]: { label: "Total Damage Blocked" },
    ["healing.sum"]: { label: "Total Healing" },
    ["multiKills.sum"]: { label: "Multi-kills" },
  } satisfies ChartConfig;

  return (
    <ChartGrid>
      <CustomChart
        data={membersMap}
        nameKey="playerName"
        dataKey="kills.sum"
        title="Kills Per Player"
        description="Kills all time"
        config={sumConfig}
        ignoreWarnings
      />
      <CustomChart
        data={membersMap}
        nameKey="playerName"
        dataKey="deaths.sum"
        title="Deaths Per Player"
        description="Deaths all time"
        config={sumConfig}
        ignoreWarnings
      />
      <CustomChart
        data={membersMap}
        nameKey="playerName"
        dataKey="assists.sum"
        title="Assists Per Player"
        description="Assists all time"
        config={sumConfig}
        ignoreWarnings
      />
      <CustomChart
        data={membersMap}
        nameKey="playerName"
        dataKey="kd"
        title="K/D Ratio"
        description="Total kills divided by total deaths"
        config={sumConfig}
        ignoreWarnings
      />
      <CustomChart
        data={membersMap}
        nameKey="playerName"
        dataKey="dmg.sum"
        title="Damage Per Player"
        description="Damage dealt all time"
        config={sumConfig}
        ignoreWarnings
      />
      <CustomChart
        data={membersMap}
        nameKey="playerName"
        dataKey="dmg_blocked.sum"
        title="Damage Blocked Per Player"
        description="Damage blocked all time"
        config={sumConfig}
        ignoreWarnings
      />
      <CustomChart
        data={membersMap}
        nameKey="playerName"
        dataKey="healing.sum"
        title="Healing Per Player"
        description="Healing done all time"
        config={sumConfig}
        ignoreWarnings
      />
      <CustomChart
        data={membersMap}
        nameKey="playerName"
        dataKey="multiKills.sum"
        title="Multi-kills Per Player"
        description="Triple, quadra, penta and hexa kills all time"
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
export default MarvelRivals;
