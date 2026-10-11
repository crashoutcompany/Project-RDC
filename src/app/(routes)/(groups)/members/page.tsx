import type { Metadata } from "next";
import Image from "next/image";
import { Suspense } from "react";
import { connection } from "next/server";
import { Skeleton } from "@/components/ui/skeleton";
import { Leaderboard } from "@/components/versus/leaderboard";
import { VersusSelect } from "@/components/versus/stage/versus-select";
import { ChallengerBanner, Eyebrow, VsHeading } from "@/components/versus/ui";
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
      <div className="bg-vs-ink border-vs-panel-2 border-b">
        <div className="mx-auto max-w-6xl px-4 pt-8 pb-4 text-center">
          <Eyebrow>Round 1</Eyebrow>
          <h1
            data-testid="members-shell-marker"
            className="vs-title text-vs-cream animate-slam-in mt-3 text-6xl md:text-7xl"
          >
            Who&apos;s the best <span className="text-vs-gold">gamer?</span>
          </h1>
        </div>
      </div>
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
      <section className="bg-vs-ink">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 lg:grid-cols-[3fr_2fr]">
          <div>
            <VsHeading lead="The sorry" accent="scale" tone="red" />
            <p className="text-vs-cream/70 mt-2 mb-6">
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
                    className="border-vs-panel-2 size-8 border-2 object-cover"
                  />
                  <span className="vs-title text-vs-cream w-20 text-2xl not-italic">
                    {fighter.name}
                  </span>
                  <SegmentedBar value={fill} />
                  <span className="vs-title text-vs-cream/80 w-12 text-right text-xl tabular-nums">
                    {avgRank === null ? "--" : avgRank.toFixed(1)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div className="border-vs-gold vs-shadow self-start border-4 bg-vs-panel p-5">
            <p className="vs-label text-vs-gold">Latest champion</p>
            <p className="vs-title text-vs-cream mt-1 mb-4 text-4xl not-italic">
              {featured?.name ?? "Mario Kart 8"}
            </p>
            <Leaderboard entries={topFive(featured)} />
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
      className="border-vs-cream flex h-4 flex-1 -skew-x-[20deg] gap-0.5 border-2 p-0.5"
    >
      {Array.from({ length: segments }, (_, i) => (
        <span
          key={i}
          className={i < lit ? "bg-vs-gold flex-1" : "bg-vs-panel-2 flex-1"}
        />
      ))}
    </div>
  );
}

function MembersSkeleton() {
  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8">
      <Skeleton className="h-96 w-full" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} className="aspect-square" />
        ))}
      </div>
    </div>
  );
}
