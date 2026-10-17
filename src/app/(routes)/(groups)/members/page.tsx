import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { Skeleton } from "@/components/ui/skeleton";
import { Leaderboard } from "@/components/arcade/leaderboard";
import { VersusSelect } from "@/components/arcade/versus-select";
import { ArenaCard } from "@/components/arcade/arena-card";
import { STAGE_GRID, StageTitle } from "@/components/arcade/stage-title";
import { ChallengerBanner, Heading } from "@/components/arcade/ui";
import { SorryScale } from "./_components/sorry-scale";
import { cn } from "@/lib/utils";
import {
  FEATURED_ARENA,
  getArenas,
  getRoster,
  getSorryBoards,
  topFive,
  type SorryRange,
} from "@/lib/rdc-stats";

export const metadata: Metadata = {
  title: "Members | RDC Stats Tracker",
  description: "Pick two RDC members and see who comes out on top.",
};

type SearchParams = Promise<{
  sorryGame?: string | string[];
  sorryRange?: string | string[];
}>;

export default function Page({ searchParams }: { searchParams: SearchParams }) {
  return (
    <>
      {/* Static shell marker; the visible title lives in the streamed stage. */}
      <h1 data-testid="members-shell-marker" className="sr-only">
        Fighter select
      </h1>
      <Suspense fallback={<MembersSkeleton />}>
        <MembersContent searchParams={searchParams} />
      </Suspense>
      <ChallengerBanner />
    </>
  );
}

async function MembersContent({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await connection();
  const [roster, arenas] = await Promise.all([getRoster(), getArenas()]);
  const featured = arenas.find((a) => a.slug === FEATURED_ARENA);

  return (
    <div data-testid="members-content">
      <VersusSelect fighters={roster} />
      <section className="bg-black">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 lg:grid-cols-[3fr_2fr]">
          <div>
            <Suspense fallback={<Skeleton className="h-96 w-full" />}>
              <SorrySection searchParams={searchParams} />
            </Suspense>
          </div>
          <div className="border-ac-gold ac-shadow bg-ac-panel self-start border-4 p-5">
            <p className="ac-label text-ac-gold">Latest champion</p>
            <p className="ac-title text-ac-cream mt-2 mb-4 text-sm">
              {featured?.name ?? "Mario Kart 8"}
            </p>
            <Leaderboard entries={topFive(featured)} />
          </div>
        </div>
      </section>
      <section className="bg-ac-panel">
        <div className="mx-auto max-w-6xl px-4 py-14">
          <Heading lead="Choose your stage" className="mb-8" />
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {arenas.map((arena) => (
              <ArenaCard key={arena.slug} arena={arena} />
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

const RANGE_VALUES: SorryRange[] = ["all", "30d", "last10"];

/** Resolves `?sorryGame=&sorryRange=` to the initial tab of the Sorry scale. */
async function SorrySection({ searchParams }: { searchParams: SearchParams }) {
  const [params, roster, { games, boards }] = await Promise.all([
    searchParams,
    getRoster(),
    getSorryBoards(),
  ]);
  const game = games.find((g) => g.slug === params.sorryGame)?.slug ?? "all";
  const range = RANGE_VALUES.find((r) => r === params.sorryRange) ?? "all";

  return (
    <SorryScale
      roster={roster}
      games={games}
      boards={boards}
      initialGame={game}
      initialRange={range}
    />
  );
}

function MembersSkeleton() {
  return (
    <>
      <div className="border-ac-panel-2 border-b-2 bg-black">
        <div className="mx-auto max-w-6xl px-4 py-4">
          <Skeleton className="h-12 w-full" />
        </div>
      </div>
      <section className="ac-grid bg-ac-ink">
        <div className="mx-auto max-w-6xl px-4 pt-8 pb-10">
          <StageTitle />
          <div className={cn(STAGE_GRID, "mt-8 gap-4 lg:gap-6")}>
            <Skeleton className="aspect-[3/4]" />
            <div className="order-last col-span-2 grid grid-cols-4 gap-2 lg:order-none lg:col-span-1">
              {Array.from({ length: 8 }, (_, i) => (
                <Skeleton key={i} className="aspect-square" />
              ))}
            </div>
            <Skeleton className="aspect-[3/4]" />
          </div>
        </div>
      </section>
    </>
  );
}
