import type { Metadata } from "next";
import { H1 } from "@/components/headings";
import { Breadcrumbs } from "@/components/arcade/ui";
import { getAllGames, getWinsPerPlayer } from "prisma/lib/games";
import { getAllSessionsByGame } from "prisma/lib/admin";
import Mariokart from "./_components/games/mariokart";
import CallOfDuty from "./_components/games/callofduty";
import RocketLeague from "./_components/games/rocketleague";
import Speedrunners from "./_components/games/speedrunners";
import LethalCompany from "./_components/games/lethalcompany";
import MarvelRivals from "./_components/games/marvelrivals";
import { gameImages, GamesEnum } from "@/lib/constants";
import { getAllMembers } from "prisma/lib/members";
import { NoMembers } from "../../members/_components/members";
import { calcWinsPerPlayer } from "./_helpers/stats";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { GameDashboard } from "./_components/dashboard/game-dashboard";
import { assembleDashboardData } from "./_helpers/dashboard";

export type Members = NonNullable<
  Awaited<ReturnType<typeof getAllMembers>>["data"]
>;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  if (slug === "__placeholder__") return { title: "Games | RDC Stats Tracker" };

  const games = await getAllGames();
  if (!games.success || !games.data)
    return { title: "Games | RDC Stats Tracker" };

  const game = games.data.find(
    (g) => g.gameName.replace(/\s/g, "").toLowerCase() === slug,
  );
  if (!game) return { title: "Game not found | RDC Stats Tracker" };

  return {
    title: `${game.gameName} | RDC Stats Tracker`,
    description: `Session stats, wins, and timelines for ${game.gameName}.`,
  };
}

export async function generateStaticParams() {
  const games = await getAllGames();

  if (!games.success || !games.data || games.data.length === 0)
    return [{ slug: "__placeholder__" }];

  return games.data.map((game) => ({
    slug: game.gameName.replace(/\s/g, "").toLowerCase(),
  }));
}

export default function Page({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div data-testid="game-detail-shell-marker">
        <Breadcrumbs
          items={[
            { label: "Home", href: "/" },
            { label: "Games", href: "/games" },
            { label: "Dashboard" },
          ]}
        />
      </div>
      <Suspense fallback={<Skeleton className="h-72 w-full" />}>
        <GameDetailContent params={params} />
      </Suspense>
    </div>
  );
}

async function GameDetailContent({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  await connection();
  const [{ slug }, games] = await Promise.all([params, getAllGames()]);

  if (!games.success || !games.data || slug === "__placeholder__")
    return <NoGames />;

  const game = games.data.find(
    (g) => g.gameName.replace(/\s/g, "").toLowerCase() === slug,
  );
  if (!game) notFound();

  const gameName = slug as GamesEnum;
  const gameImagePath = gameImages[gameName];
  const gameImage = gameImagePath ? `/images/${gameImagePath}` : "";

  const [sessionsResult, membersResult, winsResult] = await Promise.all([
    getAllSessionsByGame(game.gameId),
    getAllMembers(),
    getWinsPerPlayer(game.gameId),
  ]);

  const sessionsData =
    sessionsResult.success && sessionsResult.data ? sessionsResult.data : [];
  const winsData =
    winsResult.success && winsResult.data ? winsResult.data : { sessions: [] };
  const winsPerPlayer = calcWinsPerPlayer(winsData);

  if (!membersResult.success || !membersResult.data) return <NoMembers />;

  const dashboardData = assembleDashboardData(
    sessionsData,
    game.gameName,
    slug,
    gameImage,
  );

  let gameComponent: React.ReactNode;

  switch (gameName) {
    case GamesEnum.MarioKart8:
      gameComponent = (
        <Mariokart
          game={game}
          members={membersResult.data}
          winsPerPlayer={winsPerPlayer}
        />
      );
      break;
    case GamesEnum.CallOfDuty:
      gameComponent = (
        <CallOfDuty
          game={game}
          members={membersResult.data}
          winsPerPlayer={winsPerPlayer}
        />
      );
      break;
    case GamesEnum.RocketLeague:
      gameComponent = (
        <RocketLeague
          game={game}
          members={membersResult.data}
          winsPerPlayer={winsPerPlayer}
        />
      );
      break;
    case GamesEnum.SpeedRunners:
      gameComponent = (
        <Speedrunners
          game={game}
          members={membersResult.data}
          winsPerPlayer={winsPerPlayer}
        />
      );
      break;
    case GamesEnum.LethalCompany:
      gameComponent = (
        <LethalCompany
          game={game}
          members={membersResult.data}
          winsPerPlayer={winsPerPlayer}
        />
      );
      break;
    case GamesEnum.MarvelRivals:
      gameComponent = (
        <MarvelRivals
          game={game}
          members={membersResult.data}
          winsPerPlayer={winsPerPlayer}
        />
      );
      break;
  }

  return (
    <div data-testid="game-detail-content">
      <GameDashboard data={dashboardData}>{gameComponent}</GameDashboard>
    </div>
  );
}

/**
 * Fallback component when no games are found.
 *
 * @returns JSX element showing a "no games found" message.
 */
const NoGames = () => (
  <div>
    <H1 className="my-0">No games found</H1>
    <p className="text-muted-foreground">
      No games found. Please check back later.
    </p>
  </div>
);
