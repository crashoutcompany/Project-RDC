import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { Skeleton } from "@/components/ui/skeleton";
import { ARENA_BAR, ArenaCard } from "@/components/arcade/arena-card";
import { Breadcrumbs, Heading, Tag } from "@/components/arcade/ui";
import { WinsMatrix } from "@/components/arcade/wins-matrix";
import { GamesEnum } from "@/lib/constants";
import { getArenas, getRoster } from "@/lib/rdc-stats";

export const metadata: Metadata = {
  title: "RDC Games",
  description:
    "Browse RDC game statistics, player rankings, and session data across Mario Kart, Rocket League, and more.",
};

const SHORT_NAMES: Record<GamesEnum, string> = {
  [GamesEnum.MarioKart8]: "MK8",
  [GamesEnum.RocketLeague]: "Rocket",
  [GamesEnum.CallOfDuty]: "COD",
  [GamesEnum.LethalCompany]: "Lethal",
  [GamesEnum.SpeedRunners]: "Speed",
  [GamesEnum.MarvelRivals]: "Rivals",
};

export default function Page() {
  return (
    <>
      <section className="ac-dusk relative overflow-hidden [--sun-x:80%]">
        <div className="mx-auto max-w-6xl px-4 pt-8 pb-12">
          <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Games" }]} />
          <Tag tone="green">pick ur battle</Tag>
          <h1
            data-testid="games-shell-marker"
            className="ac-title text-ac-cream animate-slam-in mt-4 text-3xl md:text-5xl"
          >
            Stage select
          </h1>
          <p className="text-ac-cream/90 mt-4 max-w-md">
            Game statistics, player rankings and session data for every game
            the crew plays.
          </p>
        </div>
      </section>
      <section className="ac-grid bg-ac-ink">
        <div className="mx-auto max-w-6xl px-4 py-14">
          <Heading lead="All" accent="stages" tone="pink" className="mb-8" />
          <Suspense fallback={<GamesGridSkeleton />}>
            <GamesGrid />
          </Suspense>
        </div>
      </section>
      <section className="bg-black">
        <div className="mx-auto max-w-6xl px-4 py-14">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <Heading lead="Wins by stage" className="text-ac-gold" />
            <Tag tone="pink">brighter = more wins</Tag>
          </div>
          <p className="ac-label text-ac-cream/70 mt-3 mb-4">
            Every fighter × every stage
          </p>
          <Suspense fallback={<Skeleton className="h-96" />}>
            <Matrix />
          </Suspense>
        </div>
      </section>
    </>
  );
}

async function GamesGrid() {
  await connection();
  const arenas = await getArenas();
  return (
    <div
      className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3"
      data-testid="games-content"
    >
      {arenas.map((arena) => (
        <ArenaCard key={arena.slug} arena={arena} showStats />
      ))}
    </div>
  );
}

async function Matrix() {
  await connection();
  const [arenas, roster] = await Promise.all([getArenas(), getRoster()]);
  return (
    <WinsMatrix
      arenas={arenas.map((a) => ({
        slug: a.slug,
        short: SHORT_NAMES[a.slug] ?? a.name,
        bar: ARENA_BAR[a.slug] ?? "bg-ac-gold",
      }))}
      rows={roster.map((f) => ({
        slug: f.slug,
        name: f.name,
        portrait: f.art.portrait,
        cells: Object.fromEntries(
          arenas.map((a) => {
            if (!a.matches) return [a.slug, null];
            const r = a.records[f.slug];
            return [
              a.slug,
              { matches: r?.matches ?? 0, sets: r?.sets ?? 0, days: r?.days ?? 0 },
            ];
          }),
        ),
      }))}
    />
  );
}

function GamesGridSkeleton() {
  return (
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }, (_, i) => (
        <Skeleton key={i} className="h-36" />
      ))}
    </div>
  );
}
