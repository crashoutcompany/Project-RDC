import type { Metadata } from "next";
import Image from "next/image";
import { Suspense } from "react";
import { connection } from "next/server";
import { Skeleton } from "@/components/ui/skeleton";
import { Leaderboard } from "@/components/arcade/leaderboard";
import { VersusSelect } from "@/components/arcade/versus-select";
import { ChallengerBanner, Heading, Tag } from "@/components/arcade/ui";
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
      <div className="bg-ac-ink border-ac-panel-2 border-b">
        <div className="mx-auto max-w-6xl px-4 pt-8 pb-4 text-center">
          <Tag tone="green" className="text-3xl">
            who&apos;s the best gamer?
          </Tag>
          <h1
            data-testid="members-shell-marker"
            className="ac-title text-ac-cream animate-slam-in mt-4 text-2xl md:text-4xl"
          >
            Fighter select
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
          <div className="border-ac-gold ac-shadow self-start border-4 bg-ac-panel p-5">
            <p className="ac-label text-ac-gold">Latest champion</p>
            <p className="ac-title text-ac-cream mt-2 mb-4 text-sm">
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
      className="border-ac-cream flex h-4 flex-1 gap-0.5 border-2 p-0.5"
    >
      {Array.from({ length: segments }, (_, i) => (
        <span
          key={i}
          className={i < lit ? "bg-ac-gold flex-1" : "bg-[#4a4690] flex-1"}
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
