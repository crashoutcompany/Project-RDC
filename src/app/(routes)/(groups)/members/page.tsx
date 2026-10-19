import type { Metadata } from "next";
import Image from "next/image";
import { Suspense } from "react";
import { connection } from "next/server";
import { Skeleton } from "@/components/ui/skeleton";
import { Leaderboard } from "@/components/arcade/leaderboard";
import { VersusSelect } from "@/components/arcade/versus-select";
import { ArenaCard } from "@/components/arcade/arena-card";
import { STAGE_GRID, StageTitle } from "@/components/arcade/stage-title";
import { ChallengerBanner, Heading } from "@/components/arcade/ui";
import { cn } from "@/lib/utils";
import {
  FEATURED_ARENA,
  getArenas,
  getRoster,
  sorryScale,
  topFive,
} from "@/lib/rdc-stats";

export const metadata: Metadata = {
  title: "Members | RDC Stats Tracker",
  description: "Pick two RDC members and see who comes out on top.",
};

export default function Page() {
  return (
    <>
      {/* Static shell marker; the visible title lives in the streamed stage. */}
      <h1 data-testid="members-shell-marker" className="sr-only">
        Fighter select
      </h1>
      <Suspense fallback={<MembersSkeleton />}>
        <MembersContent />
      </Suspense>
      <ChallengerBanner />
    </>
  );
}

async function MembersContent() {
  await connection();
  const [roster, arenas] = await Promise.all([getRoster(), getArenas()]);
  const featured = arenas.find((a) => a.slug === FEATURED_ARENA);
  const sorry = sorryScale(roster, arenas);

  return (
    <div data-testid="members-content">
      <VersusSelect fighters={roster} />
      <section className="bg-black">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 lg:grid-cols-[3fr_2fr]">
          <div>
            <Heading lead="Sorry scale" className="text-ac-gold" />
            <p className="text-ac-cream/70 mt-2 mb-6">
              Average ranking across all games. Emptiest health bar is the
              sorriest.
            </p>
            <ul className="space-y-3">
              {sorry.map(({ fighter, avgRank, fill }) => (
                <li key={fighter.slug} className="flex items-center gap-3">
                  <Image
                    src={fighter.art.portrait}
                    alt=""
                    width={32}
                    height={32}
                    className="ac-pixel border-ac-panel-2 size-8 border-2 object-cover"
                  />
                  <span className="ac-label text-ac-cream w-20">
                    {fighter.name}
                  </span>
                  <SegmentedBar value={fill} />
                  <span className="text-ac-cream/80 w-12 text-right text-2xl tabular-nums">
                    {avgRank === null ? "--" : avgRank.toFixed(1)}
                  </span>
                </li>
              ))}
            </ul>
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

/** Health bar broken into segments, like a fighting-game super meter. */
function SegmentedBar({ value }: { value: number }) {
  const segments = 24;
  const lit = Math.round(Math.max(0, Math.min(1, value)) * segments);
  return (
    <div
      role="meter"
      aria-valuemin={0}
      aria-valuemax={segments}
      aria-valuenow={lit}
      className="border-ac-cream flex h-4 flex-1 gap-0.5 border-2 p-0.5"
    >
      {Array.from({ length: segments }, (_, i) => (
        <span
          key={i}
          className={i < lit ? "bg-ac-gold flex-1" : "flex-1 bg-[#4a4690]"}
        />
      ))}
    </div>
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
