import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { Skeleton } from "@/components/ui/skeleton";
import { ArenaCard } from "@/components/versus/arena-card";
import { Leaderboard } from "@/components/versus/leaderboard";
import { RosterHero } from "@/components/versus/stage/roster-hero";
import {
  ChallengerBanner,
  Eyebrow,
  FightBar,
  HowToPlay,
  SkewPortrait,
  VsButton,
  VsHeading,
} from "@/components/versus/ui";
import {
  FEATURED_ARENA,
  getArenas,
  getRoster,
  topFive,
} from "@/lib/rdc-stats";

export default function Home() {
  return (
    <>
      <section data-stage-root className="vs-dusk relative isolate overflow-hidden">
        <div className="relative mx-auto max-w-6xl px-4 pt-5">
          <FightBar right="8 Fighters" />
          <div className="mt-8 text-center">
            <Eyebrow>A fan-made stat tracker</Eyebrow>
            <h1
              data-testid="home-shell-marker"
              className="vs-title animate-slam-in mt-4 text-8xl drop-shadow-[5px_5px_0_rgba(13,11,16,0.6)] md:text-[10rem]"
            >
              <span className="text-vs-gold">RDC</span>{" "}
              <span className="text-vs-cream">Stats</span>
            </h1>
            <p className="vs-title text-vs-cream mt-2 text-3xl tracking-[0.2em] not-italic md:text-4xl">
              Who&apos;s the best gamer?
            </p>
            <p className="text-vs-cream/90 mt-2 font-medium">
              Every game, every session, every K.O. The group&apos;s scores,
              ranked.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-4">
              <VsButton href="/games" data-testid="home-games-link">
                Press start
              </VsButton>
              <VsButton
                href="/members"
                variant="dark"
                data-testid="home-members-link"
              >
                Meet the fighters
              </VsButton>
            </div>
          </div>
        </div>
        <Suspense fallback={<RosterSkeleton />}>
          <HomeRoster />
        </Suspense>
        <p className="vs-label text-vs-cream/80 relative pb-4 text-center">
          <span className="bg-vs-ink/70 px-3 py-1">
            Win share · Mario Kart 8 · bar length vs. the leader
          </span>
        </p>
      </section>

      <section className="bg-vs-panel">
        <Suspense fallback={<ChampionSkeleton />}>
          <ChampionAndTopFive />
        </Suspense>
      </section>

      <section className="bg-vs-ink">
        <div className="mx-auto max-w-6xl px-4 py-14">
          <div className="mb-8 flex items-end justify-between">
            <VsHeading lead="Choose your" accent="arena" tone="blue" />
            <Link href="/games" className="vs-label text-vs-gold hover:text-vs-cream">
              All games ▶
            </Link>
          </div>
          <Suspense fallback={<ArenaSkeleton />}>
            <HomeArenas />
          </Suspense>
        </div>
      </section>

      <section className="bg-vs-panel border-vs-gold border-t-4">
        <div className="mx-auto max-w-6xl px-4 py-14">
          <VsHeading lead="How to" accent="play" className="mb-8" />
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
        <Skeleton key={i} className="vs-skew bg-vs-ink/40 aspect-[3/4.4]" />
      ))}
    </div>
  );
}

async function ChampionAndTopFive() {
  await connection();
  const [arenas, roster] = await Promise.all([getArenas(), getRoster()]);
  const featured = arenas.find((a) => a.slug === FEATURED_ARENA);
  const board = topFive(featured);
  const champ = roster.find((f) => f.slug === featured?.champion);

  return (
    <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 md:grid-cols-2">
      <div>
        <p className="vs-label text-vs-gold mb-2">Main event</p>
        <VsHeading lead="Latest" accent="champion" tone="red" className="mb-6" />
        {champ ? (
          <div className="border-vs-gold vs-shadow flex gap-5 border-4 bg-vs-ink p-5">
            <SkewPortrait
              src={champ.art.portrait}
              alt={champ.name}
              sizes="140px"
              className="aspect-[3/4] w-32 shrink-0"
            />
            <div className="flex flex-col justify-center">
              <p className="vs-label text-vs-gold">MVP · {featured?.name}</p>
              <p className="vs-title text-vs-cream text-6xl">{champ.name}</p>
              <p className="text-vs-cream/70">
                {champ.wins} wins and counting.
              </p>
              <VsButton href={`/members/${champ.slug}`} className="mt-3 self-start text-lg">
                View fighter
              </VsButton>
            </div>
          </div>
        ) : (
          <p className="text-vs-cream/70">No champion crowned yet.</p>
        )}
      </div>
      <div>
        <p className="vs-label text-vs-gold mb-2">Leaderboard</p>
        <VsHeading lead="Top" accent="five" tone="blue" className="mb-6" />
        <Leaderboard entries={board} />
        <Link
          href={`/games/${FEATURED_ARENA}`}
          className="vs-label text-vs-cream/80 hover:text-vs-gold mt-4 inline-block"
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
        <Skeleton key={i} className="h-36 -skew-x-6" />
      ))}
    </div>
  );
}
