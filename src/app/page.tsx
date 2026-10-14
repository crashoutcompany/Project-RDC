import Image from "next/image";
import { Suspense } from "react";
import { connection } from "next/server";
import {
  ArcadeHeroScene,
  PressStartLink,
} from "@/components/arcade/scene/arcade-hero";
import {
  Eyebrow,
  ArcadeButton,
  arcadeButtonClass,
  Tag,
} from "@/components/arcade/ui";
import { FEATURED_ARENA, getArenas, topFive } from "@/lib/rdc-stats";

export default function Home() {
  return (
    <section
      data-stage-root
      data-fullscreen-stage
      className="group ac-dusk relative isolate flex h-full min-h-[420px] items-end overflow-hidden [--sun-x:68%] [--sun-y:48%] md:items-center"
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
    </section>
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
