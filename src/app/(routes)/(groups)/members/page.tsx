import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { Skeleton } from "@/components/ui/skeleton";
import { Leaderboard } from "@/components/arcade/leaderboard";
import { VersusSelect } from "@/components/arcade/versus-select";
import { ArenaCard } from "@/components/arcade/arena-card";
import { STAGE_GRID, StageTitle } from "@/components/arcade/stage-title";
import { ChallengerBanner, Heading } from "@/components/arcade/ui";
import { GamesEnum } from "@/lib/constants";
import { cn } from "@/lib/utils";
import {
  FEATURED_ARENA,
  getArenas,
  getRoster,
  getSorryScale,
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

const RANGES: { value: SorryRange; label: string }[] = [
  { value: "all", label: "All-time" },
  { value: "30d", label: "30 days" },
  { value: "last10", label: "Last 10" },
];

/** Sorry scale with game and time filters driven by `?sorryGame=&sorryRange=`. */
async function SorrySection({ searchParams }: { searchParams: SearchParams }) {
  const [params, arenas] = await Promise.all([searchParams, getArenas()]);
  const gameParam =
    typeof params.sorryGame === "string" ? params.sorryGame : "";
  const game: GamesEnum | "all" = arenas.some((a) => a.slug === gameParam)
    ? (gameParam as GamesEnum)
    : "all";
  const range =
    RANGES.find((r) => r.value === params.sorryRange)?.value ?? "all";
  const sorry = await getSorryScale({ game, range });
  const hasData = sorry.some((e) => e.avgRank !== null);
  const gameName = arenas.find((a) => a.slug === game)?.name;

  const href = (next: { sorryGame?: string; sorryRange?: SorryRange }) => ({
    pathname: "/members",
    query: { sorryGame: game, sorryRange: range, ...next },
  });

  return (
    <>
      <Heading lead="Sorry scale" className="text-ac-gold" />
      <p className="text-ac-cream/70 mt-2">
        {gameName
          ? `Average ranking in ${gameName}.`
          : "Average ranking across all games."}{" "}
        Emptiest health bar is the sorriest.
      </p>
      <div className="mt-4 mb-6 flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          <FilterTab href={href({ sorryGame: "all" })} active={game === "all"}>
            All games
          </FilterTab>
          {arenas.map((a) => (
            <FilterTab
              key={a.slug}
              href={href({ sorryGame: a.slug })}
              active={game === a.slug}
            >
              {a.name}
            </FilterTab>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {RANGES.map((r) => (
            <FilterTab
              key={r.value}
              href={href({ sorryRange: r.value })}
              active={range === r.value}
            >
              {r.label}
            </FilterTab>
          ))}
        </div>
      </div>
      {hasData ? (
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
      ) : (
        <p className="ac-label text-ac-cream/70 border-ac-panel-2 border-2 border-dashed p-6 text-center">
          No ranked matches in this range
        </p>
      )}
    </>
  );
}

function FilterTab({
  href,
  active,
  children,
}: {
  href: { pathname: string; query: Record<string, string> };
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      scroll={false}
      aria-current={active ? "true" : undefined}
      className={cn(
        "ac-label border-2 px-3 py-1.5 transition-colors",
        active
          ? "border-ac-gold bg-ac-gold text-ac-ink"
          : "border-ac-cream/40 text-ac-cream/80 hover:border-ac-cream",
      )}
    >
      {children}
    </Link>
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
