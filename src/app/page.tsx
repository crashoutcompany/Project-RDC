import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { Skeleton } from "@/components/ui/skeleton";
import { ArenaCard } from "@/components/arcade/arena-card";
import { Leaderboard } from "@/components/arcade/leaderboard";
import { RosterHero } from "@/components/arcade/roster-hero";
import {
  ArcadeHeroScene,
  PressStartLink,
  SkipToStats,
} from "@/components/arcade/scene/arcade-hero";
import {
  ChallengerBanner,
  Eyebrow,
  HowToPlay,
  PixelPortrait,
  ArcadeButton,
  arcadeButtonClass,
  Heading,
  Tag,
} from "@/components/arcade/ui";
import { FEATURED_ARENA, getArenas, getRoster, topFive } from "@/lib/rdc-stats";

export default function Home() {
  return (
    <>
      <section
        data-stage-root
        className="group ac-dusk relative isolate flex h-[min(72svh,720px)] min-h-[480px] items-end overflow-hidden [--sun-x:68%] [--sun-y:48%] md:items-center"
      >
        {/* Static first paint; the live 3D room fades in over it later. */}
        <Image
          src="/images/arcade-room-poster.webp"
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover object-[68%_50%]"
        />
        <Suspense fallback={null}>
          <HomeScene />
        </Suspense>
        <div
          aria-hidden
          className="from-ac-ink/85 via-ac-ink/40 pointer-events-none absolute inset-0 bg-linear-to-t to-transparent transition-opacity duration-500 group-data-zooming:opacity-0 md:bg-linear-to-r md:via-transparent"
        />
        <div className="pointer-events-none relative mx-auto w-full max-w-6xl px-4 pb-14 transition-opacity duration-500 group-data-zooming:opacity-0 md:pb-0">
          <div className="max-w-md">
            <Eyebrow>A fan-made stat tracker</Eyebrow>
            <h1
              data-testid="home-shell-marker"
              className="ac-title text-ac-gold animate-slam-in mt-5 text-4xl drop-shadow-[4px_4px_0_#ff2d55] md:text-6xl"
            >
              RDC Stats
            </h1>
            <Tag tone="green" className="mt-4 text-4xl">
              who&apos;s the best gamer?
            </Tag>
            <p className="text-ac-cream/90 mt-3">
              Every game, every session, every K.O. The group&apos;s scores,
              ranked.
            </p>
            <div className="pointer-events-auto mt-6 flex flex-wrap gap-4">
              <PressStartLink
                href="/games"
                data-testid="home-games-link"
                className={arcadeButtonClass()}
              >
                ▶ Press start
              </PressStartLink>
              <ArcadeButton
                href="/members"
                variant="dark"
                data-testid="home-members-link"
              >
                Meet the fighters
              </ArcadeButton>
            </div>
          </div>
        </div>
        <SkipToStats className="ac-label text-ac-cream hover:text-ac-gold bg-ac-ink/70 absolute bottom-3 left-1/2 -translate-x-1/2 px-3 py-2" />
      </section>

      <section
        id="stats"
        tabIndex={-1}
        className="ac-grid bg-ac-ink scroll-mt-16 outline-none"
      >
        <div className="mx-auto max-w-6xl px-4 pt-12">
          <Heading lead="Fighters" className="text-ac-gold" />
        </div>
        <Suspense fallback={<RosterSkeleton />}>
          <HomeRoster />
        </Suspense>
        <p className="ac-label text-ac-cream/80 pb-8 text-center">
          Win share · Mario Kart 8 · bar length vs. the leader
        </p>
      </section>

      <section className="ac-grid bg-ac-panel">
        <Suspense fallback={<ChampionSkeleton />}>
          <ChampionAndTopFive />
        </Suspense>
      </section>

      <section className="bg-ac-ink">
        <div className="mx-auto max-w-6xl px-4 py-14">
          <div className="mb-8 flex items-end justify-between">
            <Heading lead="Stage" accent="select" tone="pink" />
            <Tag tone="green">pick ur battle</Tag>
          </div>
          <Suspense fallback={<ArenaSkeleton />}>
            <HomeArenas />
          </Suspense>
        </div>
      </section>

      <section className="bg-black">
        <div className="mx-auto max-w-6xl px-4 py-14">
          <Heading lead="How to play" className="text-ac-gold mb-8" />
          <HowToPlay />
        </div>
      </section>

      <ChallengerBanner />
    </>
  );
}

async function HomeScene() {
  await connection();
  const arenas = await getArenas();
  return (
    <ArcadeHeroScene
      board={topFive(arenas.find((a) => a.slug === FEATURED_ARENA))}
    />
  );
}

async function HomeRoster() {
  await connection();
  const roster = await getRoster();
  return <RosterHero fighters={roster} />;
}

function RosterSkeleton() {
  return (
    <div className="mx-auto grid max-w-6xl grid-cols-4 gap-3 px-4 pt-6 pb-10 md:grid-cols-8">
      {Array.from({ length: 8 }, (_, i) => (
        <Skeleton key={i} className="ac-skew bg-ac-ink/40 aspect-[3/4.4]" />
      ))}
    </div>
  );
}

async function ChampionAndTopFive() {
  await connection();
  const [arenas, roster] = await Promise.all([getArenas(), getRoster()]);
  const featured = arenas.find((a) => a.slug === FEATURED_ARENA);
  const board = topFive(featured);
  const champ = roster.find(
    (f) => f.slug === featured?.champion?.toLowerCase(),
  );

  return (
    <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 md:grid-cols-2">
      <div>
        <p className="ac-label text-ac-gold mb-2">Main event</p>
        <Heading lead="Latest" accent="champion" tone="red" className="mb-6" />
        {champ ? (
          <div className="border-ac-gold ac-shadow bg-ac-ink flex gap-5 border-4 p-5">
            <PixelPortrait
              src={champ.art.portrait}
              alt={champ.name}
              pixels={40}
              className="border-ac-red aspect-[3/4] w-32 shrink-0 border-2"
            />
            <div className="flex flex-col justify-center">
              <p className="ac-label text-ac-gold">MVP · {featured?.name}</p>
              <p className="ac-title text-ac-cream mt-2 text-2xl">
                {champ.name}
              </p>
              <p className="text-ac-cream/70">
                {champ.wins} wins and counting.
              </p>
              <ArcadeButton
                href={`/members/${champ.slug}`}
                className="mt-4 self-start"
              >
                View fighter
              </ArcadeButton>
            </div>
          </div>
        ) : (
          <p className="text-ac-cream/70">No champion crowned yet.</p>
        )}
      </div>
      <div>
        <p className="ac-label text-ac-gold mb-2">Leaderboard</p>
        <Heading lead="Top" accent="five" tone="blue" className="mb-6" />
        <Leaderboard entries={board} />
        <Link
          href={`/games/${FEATURED_ARENA}`}
          className="ac-label text-ac-cream/80 hover:text-ac-gold mt-4 inline-block"
        >
          Full stats on every game ▶
        </Link>
      </div>
    </div>
  );
}

function ChampionSkeleton() {
  return (
    <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 md:grid-cols-2">
      <Skeleton className="h-56" />
      <Skeleton className="h-56" />
    </div>
  );
}

async function HomeArenas() {
  await connection();
  const arenas = await getArenas();
  return (
    <div
      className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3"
      data-testid="home-games-content"
    >
      {arenas.map((arena) => (
        <ArenaCard key={arena.slug} arena={arena} />
      ))}
    </div>
  );
}

function ArenaSkeleton() {
  return (
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }, (_, i) => (
        <Skeleton key={i} className="h-36" />
      ))}
    </div>
  );
}
