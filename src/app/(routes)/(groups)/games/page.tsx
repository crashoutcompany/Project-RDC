import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { Skeleton } from "@/components/ui/skeleton";
import { ARENA_BAR, ArenaCard } from "@/components/versus/arena-card";
import { Breadcrumbs, Eyebrow, VsHeading } from "@/components/versus/ui";
import { WinsMatrix } from "@/components/versus/wins-matrix";
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
      <section className="vs-dusk relative overflow-hidden [--sun-x:80%]">
        <div className="mx-auto max-w-6xl px-4 pt-8 pb-12">
          <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Games" }]} />
          <Eyebrow>Game statistics</Eyebrow>
          <h1
            data-testid="games-shell-marker"
            className="vs-title text-vs-cream animate-slam-in mt-3 text-7xl md:text-8xl"
          >
            Choose your <span className="text-vs-blue drop-shadow-[3px_3px_0_#0d0b10]">arena</span>
          </h1>
          <p className="text-vs-cream mt-3 max-w-md font-medium">
            Game statistics, player rankings and session data for every game
            the crew plays.
          </p>
        </div>
      </section>
      <section className="bg-vs-ink">
        <div className="mx-auto max-w-6xl px-4 py-14">
          <VsHeading lead="All" accent="arenas" className="mb-8" />
          <Suspense fallback={<GamesGridSkeleton />}>
            <GamesGrid />
          </Suspense>
        </div>
      </section>
      <section className="bg-vs-panel border-vs-gold border-t-4">
        <div className="mx-auto max-w-6xl px-4 py-14">
          <VsHeading lead="Wins by" accent="arena" tone="red" />
          <p className="text-vs-cream/70 mt-2 mb-4">
            Every fighter across every arena. Brighter means more wins.
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
        bar: ARENA_BAR[a.slug] ?? "bg-vs-gold",
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
        <Skeleton key={i} className="h-36 -skew-x-6" />
      ))}
    </div>
  );
}
