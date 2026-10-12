import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { Skeleton } from "@/components/ui/skeleton";
import { ArenaCard } from "@/components/arcade/arena-card";
import { Leaderboard } from "@/components/arcade/leaderboard";
import { RosterHero } from "@/components/arcade/roster-hero";
import {
  ChallengerBanner,
  Eyebrow,
  HowToPlay,
  PixelPortrait,
  ArcadeButton,
  Heading,
  Tag,
} from "@/components/arcade/ui";
import {
  FEATURED_ARENA,
  getArenas,
  getRoster,
  topFive,
} from "@/lib/rdc-stats";

export default function Home() {
  return (
    <>
      <section className="ac-dusk relative overflow-hidden [--sun-y:48%]">
        <div className="relative mx-auto max-w-6xl px-4 pt-5">
          <div className="mt-8 text-center">
            <Eyebrow>A fan-made stat tracker</Eyebrow>
            <h1
              data-testid="home-shell-marker"
              className="ac-title text-ac-gold animate-slam-in mt-5 text-5xl drop-shadow-[5px_5px_0_#ff2d55] md:text-7xl"
            >
              RDC Stats
            </h1>
            <Tag tone="green" className="mt-4 text-4xl md:text-5xl">
              who&apos;s the best gamer?
            </Tag>
            <p className="text-ac-cream/90 mx-auto mt-3 max-w-md">
              Every game, every session, every K.O. The group&apos;s scores,
              ranked.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-4">
              <ArcadeButton href="/games" data-testid="home-games-link">
                ▶ Press start
              </ArcadeButton>
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
        <Suspense fallback={<RosterSkeleton />}>
          <HomeRoster />
        </Suspense>
        <p className="ac-label text-ac-cream/80 relative pb-4 text-center">
          <span className="bg-ac-ink/70 px-3 py-1">
            Win share · Mario Kart 8 · bar length vs. the leader
          </span>
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
          <div className="border-ac-gold ac-shadow flex gap-5 border-4 bg-ac-ink p-5">
            <PixelPortrait
              src={champ.art.portrait}
              alt={champ.name}
              pixels={40}
              className="border-ac-red aspect-[3/4] w-32 shrink-0 border-2"
            />
            <div className="flex flex-col justify-center">
              <p className="ac-label text-ac-gold">MVP · {featured?.name}</p>
              <p className="ac-title text-ac-cream mt-2 text-2xl">{champ.name}</p>
              <p className="text-ac-cream/70">
                {champ.wins} wins and counting.
              </p>
              <ArcadeButton href={`/members/${champ.slug}`} className="mt-4 self-start">
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
