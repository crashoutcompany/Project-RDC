import type { Metadata } from "next";
import { H1 } from "@/components/headings";
import { getAllGames, getWinsPerPlayer } from "prisma/lib/games";
import { getAllSessionsByGame } from "prisma/lib/admin";
import Mariokart from "./_components/games/mariokart";
import CallOfDuty from "./_components/games/callofduty";
import RocketLeague from "./_components/games/rocketleague";
import Speedrunners from "./_components/games/speedrunners";
import LethalCompany from "./_components/games/lethalcompany";
import { gameImages, GamesEnum } from "@/lib/constants";
import { TimelineChart } from "./_components/timeline/timeline-chart";
import { Separator } from "@/components/ui/separator";
import { getAllMembers } from "prisma/lib/members";
import { NoMembers } from "../../members/_components/members";
import { calcWinsPerPlayer } from "./_helpers/stats";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { connection } from "next/server";

export type Members = NonNullable<
  Awaited<ReturnType<typeof getAllMembers>>["data"]
>;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  if (slug === "__placeholder__")
    return { title: "Games | RDC Stats Tracker" };

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

  if (!games.success || !games.data || games.data.length === 0) {
    return [{ slug: "__placeholder__" }];
  }
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
    <div className="m-16">
      <H1 className="my-0" data-testid="game-detail-shell-marker">
        Game Stats
      </H1>
      <Suspense fallback={<Skeleton className="mt-4 h-64 w-full" />}>
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
  )!;

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

  if (!members.success || !members.data) {
    return <NoMembers />;
  }

  const gameName = slug as GamesEnum;
  let component: React.ReactNode;

  switch (gameName) {
    case GamesEnum.MarioKart8:
      component = (
        <Mariokart
          game={game}
          members={members.data}
          winsPerPlayer={winsPerPlayer}
        />
      );
      break;
    case GamesEnum.CallOfDuty:
      component = (
        <CallOfDuty
          game={game}
          members={members.data}
          winsPerPlayer={winsPerPlayer}
        />
      );
      break;
    case GamesEnum.RocketLeague:
      component = (
        <RocketLeague
          game={game}
          members={members.data}
          winsPerPlayer={winsPerPlayer}
        />
      );
      break;
    case GamesEnum.SpeedRunners:
      component = (
        <Speedrunners
          game={game}
          members={members.data}
          winsPerPlayer={winsPerPlayer}
        />
      );
      break;
    case GamesEnum.LethalCompany:
      component = (
        <LethalCompany
          game={game}
          members={members.data}
          winsPerPlayer={winsPerPlayer}
        />
      );
      break;
  }

  const gameNameKey = game.gameName
    .replace(/\s/g, "")
    .toLowerCase() as keyof typeof gameImages;

  return (
    <div data-testid="game-detail-content">
      <H1 className="my-0">{game.gameName}</H1>
      <TimelineChart
        gameName={gameNameKey}
        sessions={sessions.data}
        title={`${game.gameName} Videos`}
        desc="Use the keyboard to view specific data for a video"
      />
      <Separator className="my-4" />
      {component}
    </div>
  );
}

const NoGames = () => (
  <div>
    <H1 className="my-0">No games found</H1>
    <p className="text-muted-foreground">
      No games found. Please check back later.
    </p>
  </div>
);
