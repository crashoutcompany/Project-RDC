import type { Metadata } from "next";
import { H1 } from "@/components/headings";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import Image from "next/image";
import Link from "next/link";
import { getGamesNav } from "@/lib/constants";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { connection } from "next/server";

export const metadata: Metadata = {
  title: "RDC Games",
  description:
    "Browse RDC game statistics, player rankings, and session data across Mario Kart, Rocket League, and more.",
};

export default function Page() {
  return (
    <div className="m-16">
      <H1 data-testid="games-shell-marker">Games</H1>
      <Suspense fallback={<GamesGridSkeleton />}>
        <GamesGrid />
      </Suspense>
      <div className="mt-10 flex gap-10">
        <Card className="h-64 flex-1">
          <CardHeader>
            <CardTitle>Chart</CardTitle>
          </CardHeader>
        </Card>
        <Card className="h-64 flex-1">
          <CardHeader>
            <CardTitle>Chart</CardTitle>
          </CardHeader>
        </Card>
      </div>
    </div>
  );
}

async function GamesGrid() {
  await connection();
  const games = await getGamesNav();
  return (
    <div
      className="flex flex-wrap justify-center gap-10"
      data-testid="games-content"
    >
      {games.map((game) => (
        <div key={game.url}>
          {game.src && (
            <Card className="group relative aspect-square h-52 w-full min-w-24 overflow-hidden transition-transform duration-700 sm:w-52">
              <Link href={game.url} className="relative block h-full w-full">
                <Image
                  className="object-cover transition-transform duration-300 ease-out motion-reduce:transform-none motion-reduce:transition-none [@media(hover:hover)_and_(pointer:fine)]:group-hover:scale-125"
                  fill
                  sizes="(max-width: 639px) 100vw, 208px"
                  alt=""
                  src={game.src || ""}
                />
                <CardHeader className="relative h-1/4 bg-black/50">
                  <CardTitle className="absolute font-extrabold text-white opacity-100">
                    {game.name}
                  </CardTitle>
                </CardHeader>
              </Link>
            </Card>
          )}
        </div>
      ))}
    </div>
  );
}

function GamesGridSkeleton() {
  return (
    <div className="flex flex-wrap justify-center gap-10">
      <Skeleton className="h-52 w-52" />
      <Skeleton className="h-52 w-52" />
      <Skeleton className="h-52 w-52" />
      <Skeleton className="h-52 w-52" />
    </div>
  );
}
