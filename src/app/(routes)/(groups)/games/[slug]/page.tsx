"use cache";
import { getAllGames, getWinsPerPlayer } from "prisma/lib/games";
import { getAllSessionsByGame } from "prisma/lib/admin";
import Mariokart from "./_components/games/mariokart";
import CallOfDuty from "./_components/games/callofduty";
import RocketLeague from "./_components/games/rocketleague";
import Speedrunners from "./_components/games/speedrunners";
import LethalCompany from "./_components/games/lethalcompany";
import { gameImages, GamesEnum } from "@/lib/constants";
import { getAllMembers } from "prisma/lib/members";
import { NoMembers } from "../../members/_components/members";
import { calcWinsPerPlayer } from "./_helpers/stats";
import { GameDashboard } from "./_components/dashboard/game-dashboard";
import { assembleDashboardData } from "./_helpers/dashboard";

export type Members = NonNullable<
  Awaited<ReturnType<typeof getAllMembers>>["data"]
>;

/**
 * Generates static params for all games for SSG.
 *
 * @returns Array of slug objects for each game.
 */
export async function generateStaticParams() {
  const games = await getAllGames();

  if (!games.success || !games.data || games.data.length === 0)
    return [{ slug: "__placeholder__" }];

  return games.data.map((game) => ({
    slug: game.gameName.replace(/\s/g, "").toLowerCase(),
  }));
}

/**
 * Renders the game dashboard page with banner stats, MVP profile,
 * leaderboard, replay library, replay viewer, recent matches,
 * and game-specific stat charts.
 *
 * @param props - Contains route params with the game slug.
 * @returns The game dashboard page JSX element.
 */
export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const games = await getAllGames();

  if (!games.success || !games.data || slug === "__placeholder__")
    return <NoGames />;

  const game = games.data.find(
    (g) => g.gameName.replace(/\s/g, "").toLowerCase() === slug,
  )!;

  const gameImage = `/images/${gameImages[gameName] || ""}`;

  const dashboardData = assembleDashboardData(
    sessions.data,
    game.gameName,
    slug,
    gameImage,
  );
  // Parallelize independent data fetches
  const [sessionsResult, membersResult, winsResult] = await Promise.all([
    getAllSessionsByGame(game.gameId),
    getAllMembers(),
    getWinsPerPlayer(game.gameId),
  ]);

  const sessions = sessionsResult.success
    ? sessionsResult
    : { success: false, data: [] };
  const members = membersResult;
  const wins = winsResult.success
    ? winsResult
    : { success: false, data: { sessions: [] } };
  const winsPerPlayer = calcWinsPerPlayer(wins.data!);

  if (!members.success || !members.data) return <NoMembers />;

  let gameComponent: React.ReactNode;

  const gameName = slug as GamesEnum;
  let component: React.ReactNode;

  switch (gameName) {
    case GamesEnum.MarioKart8:
      gameComponent = (
        <Mariokart
          game={game}
          members={members.data}
          winsPerPlayer={winsPerPlayer}
        />
      );
      break;
    case GamesEnum.CallOfDuty:
      gameComponent = (
        <CallOfDuty
          game={game}
          members={members.data}
          winsPerPlayer={winsPerPlayer}
        />
      );
      break;
    case GamesEnum.RocketLeague:
      gameComponent = (
        <RocketLeague
          game={game}
          members={members.data}
          winsPerPlayer={winsPerPlayer}
        />
      );
      break;
    case GamesEnum.SpeedRunners:
      gameComponent = (
        <Speedrunners
          game={game}
          members={members.data}
          winsPerPlayer={winsPerPlayer}
        />
      );
      break;
    case GamesEnum.LethalCompany:
      gameComponent = (
        <LethalCompany
          game={game}
          members={members.data}
          winsPerPlayer={winsPerPlayer}
        />
      );
      break;
  }

  // Extract inline object creation for better readability
  const gameNameKey = game.gameName
    .replace(/\s/g, "")
    .toLowerCase() as keyof typeof gameImages;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <GameDashboard data={dashboardData}>
        {gameComponent}
      </GameDashboard>
    </div>
  );
}

/**
 * Fallback component when no games are found.
 *
 * @returns JSX element showing a "no games found" message.
 */
const NoGames = () => (
  <div className="m-16">
    <h1 className="text-3xl font-bold">No games found</h1>
    <p className="text-muted-foreground">
      No games found. Please check back later.
    </p>
  </div>
);
