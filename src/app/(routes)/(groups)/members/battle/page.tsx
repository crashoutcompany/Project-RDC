import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { getBattleFeeds } from "./data";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArcadeButton,
  Breadcrumbs,
  Eyebrow,
  Heading,
  PixelPortrait,
} from "@/components/arcade/ui";
import { getRoster, type Fighter } from "@/lib/rdc-stats";
import {
  headToHead,
  type BattleGame,
  type BattleSide,
  type HeadToHead,
} from "@/lib/head-to-head";
import { cn, formatSessionDate } from "@/lib/utils";

type PageProps = {
  searchParams: Promise<{ a?: string | string[]; b?: string | string[] }>;
};

export async function generateMetadata({
  searchParams,
}: PageProps): Promise<Metadata> {
  const [{ a, b }, roster] = await Promise.all([searchParams, getRoster()]);
  const one = findFighter(roster, a);
  const two = findFighter(roster, b);
  if (!one || !two || one.slug === two.slug)
    return { title: "Battle | RDC Stats Tracker" };
  return { title: `${one.name} vs ${two.name} | RDC Stats Tracker` };
}

export default function Page({ searchParams }: PageProps) {
  return (
    <>
      <div className="bg-ac-ink">
        <div
          className="mx-auto max-w-6xl px-4 pt-6"
          data-testid="battle-shell-marker"
        >
          <Breadcrumbs
            items={[
              { label: "Home", href: "/" },
              { label: "Members", href: "/members" },
              { label: "Battle" },
            ]}
          />
        </div>
      </div>
      <Suspense fallback={<Skeleton className="mx-auto h-96 max-w-6xl" />}>
        <BattleContent searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function BattleContent({ searchParams }: PageProps) {
  await connection();
  const [{ a, b }, roster, feeds] = await Promise.all([
    searchParams,
    getRoster(),
    getBattleFeeds(),
  ]);
  const one = findFighter(roster, a);
  const two = findFighter(roster, b);
  if (!one || !two || one.slug === two.slug) return <Picker />;

  const result = headToHead(one.playerId, two.playerId, feeds);

  return (
    <div data-testid="battle-content">
      <section className="ac-dusk relative overflow-hidden">
        <div className="mx-auto max-w-6xl px-4 pt-6 pb-12">
          <Eyebrow>Battle mode · {result.shared} shared sessions</Eyebrow>
          <h1 className="ac-title text-ac-cream animate-slam-in mt-3 text-4xl md:text-6xl">
            <span className="text-ac-red">{one.name}</span>{" "}
            <span className="text-ac-gold">vs</span>{" "}
            <span className="text-ac-blue">{two.name}</span>
          </h1>
          <div className="mt-6 grid grid-cols-2 items-end gap-4 md:grid-cols-[1fr_auto_1fr] md:gap-8">
            <Corner fighter={one} tone="red" />
            <Score
              result={result}
              className="order-last col-span-2 md:order-none md:col-span-1"
            />
            <Corner fighter={two} tone="blue" />
          </div>
        </div>
      </section>

      {result.shared === 0 ? (
        <section className="bg-ac-ink">
          <div className="mx-auto max-w-6xl px-4 py-12">
            <p className="ac-title text-ac-gold text-sm">No rematch yet</p>
            <p className="text-ac-cream/70 mt-2">
              {one.name} and {two.name} have not shared a session.
            </p>
          </div>
        </section>
      ) : (
        <>
          <section className="ac-grid bg-ac-ink">
            <div className="mx-auto max-w-6xl px-4 py-12">
              <Heading lead="Stage by stage" className="text-ac-gold mb-6" />
              <div className="grid gap-5 md:grid-cols-2">
                {result.games.map((game) => (
                  <GameCard key={game.slug} game={game} one={one} two={two} />
                ))}
              </div>
            </div>
          </section>

          <section className="bg-black">
            <div className="mx-auto max-w-6xl px-4 py-12">
              <Heading lead="Last 5 meetings" className="mb-6" />
              <ul className="grid gap-3">
                {result.recent.map((session) => (
                  <li key={session.sessionId}>
                    <Link
                      href={`/sessions/${session.sessionId}`}
                      className="border-ac-panel-2 bg-ac-panel hover:border-ac-gold flex flex-wrap items-baseline justify-between gap-2 border-2 p-4 transition-colors"
                    >
                      <span className="ac-title text-ac-cream text-xs">
                        {session.sessionName}
                      </span>
                      <span className="ac-label text-ac-cream/70">
                        {session.gameName} · {formatSessionDate(session.date)}
                      </span>
                      {session.dayWinners.length > 0 ? (
                        <span className="ac-label text-ac-gold w-full">
                          Day won by {session.dayWinners.join(", ")}
                        </span>
                      ) : null}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

/** Fighter lookup by roster slug. URL params are case-insensitive. */
function findFighter(roster: Fighter[], param: string | string[] | undefined) {
  const value = Array.isArray(param) ? param[0] : param;
  const key = value?.trim().toLowerCase();
  if (!key) return undefined;
  return roster.find((f) => f.slug === key);
}

function Picker() {
  return (
    <div
      data-testid="battle-picker"
      className="bg-ac-ink mx-auto flex max-w-3xl flex-col items-start gap-4 px-4 py-16"
    >
      <Eyebrow>Battle mode</Eyebrow>
      <h1 className="ac-title text-ac-cream text-3xl md:text-4xl">
        Pick two different fighters
      </h1>
      <p className="text-ac-cream/70">
        Choose a 1P and a 2P on the fighter select to see their head-to-head.
      </p>
      <ArcadeButton href="/members" variant="gold">
        Back to fighter select ▶
      </ArcadeButton>
    </div>
  );
}

function Corner({ fighter, tone }: { fighter: Fighter; tone: "red" | "blue" }) {
  return (
    <div className="flex flex-col gap-2">
      <PixelPortrait
        src={fighter.art.portrait}
        alt={fighter.name}
        pixels={48}
        priority
        className={cn(
          "aspect-[4/5] w-full border-4",
          tone === "red" ? "border-ac-red" : "border-ac-blue",
        )}
      />
      <p
        className={cn(
          "ac-label text-center",
          tone === "red" ? "text-ac-red" : "text-ac-blue",
        )}
      >
        {tone === "red" ? "1P" : "2P"} {fighter.name}
      </p>
    </div>
  );
}

function Score({
  result,
  className,
}: {
  result: HeadToHead;
  className?: string;
}) {
  const rows = [
    { label: "Matches won", a: result.a.matches, b: result.b.matches },
    { label: "Sets won", a: result.a.sets, b: result.b.sets },
    { label: "Days won", a: result.a.days, b: result.b.days },
  ];
  return (
    <div
      data-testid="battle-score"
      className={cn("border-ac-cream bg-ac-ink/70 border-2 p-3", className)}
    >
      <p className="ac-title text-ac-gold mb-3 text-center text-4xl tabular-nums md:text-5xl">
        {result.a.matches} : {result.b.matches}
      </p>
      <dl>
        {rows.map((row) => (
          <div
            key={row.label}
            className="grid grid-cols-[1fr_auto_1fr] items-baseline gap-2 py-1"
          >
            <dd className="text-ac-red text-right text-xl tabular-nums">
              {row.a}
            </dd>
            <dt className="ac-label text-ac-cream/70 text-center">
              {row.label}
            </dt>
            <dd className="text-ac-blue text-left text-xl tabular-nums">
              {row.b}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function GameCard({
  game,
  one,
  two,
}: {
  game: BattleGame;
  one: Fighter;
  two: Fighter;
}) {
  return (
    <article
      data-testid="battle-game"
      className="border-ac-panel-2 bg-ac-panel border-2 p-4"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="ac-title text-ac-cream text-sm">{game.name}</h3>
        <p className="ac-label text-ac-cream/60">{game.shared} shared</p>
      </div>
      <WinLine side={game.a} b={game.b} />
      {togetherLabel(game.together) ? (
        <p className="ac-label text-ac-gold mt-2">
          Won together: {togetherLabel(game.together)}
        </p>
      ) : null}
      {game.stats.length > 0 ? (
        <ul className="mt-4 space-y-2">
          {game.stats.map((stat) => (
            <li
              key={stat.statName}
              className="grid grid-cols-[1fr_auto_1fr] items-center gap-2"
            >
              <StatValue
                value={stat.a}
                better={stat.better === "a"}
                label={`${one.name} ${stat.displayName}`}
                className="text-ac-red text-right"
              />
              <span className="ac-label text-ac-cream/70 text-center">
                {stat.displayName}
              </span>
              <StatValue
                value={stat.b}
                better={stat.better === "b"}
                label={`${two.name} ${stat.displayName}`}
                className="text-ac-blue text-left"
              />
            </li>
          ))}
        </ul>
      ) : null}
    </article>
  );
}

/** Match wins per side within one game; the two sides line up under the names. */
function WinLine({ side, b }: { side: BattleSide; b: BattleSide }) {
  return (
    <p className="ac-label text-ac-cream/80 mt-3 flex items-center justify-between">
      <span className="text-ac-red tabular-nums">{side.matches} won</span>
      <span className="text-ac-cream/50">matches</span>
      <span className="text-ac-blue tabular-nums">{b.matches} won</span>
    </p>
  );
}

/** "2 matches, 1 day" for the non-zero shared wins, or null when there are none. */
function togetherLabel(together: BattleSide) {
  const parts = [
    { n: together.matches, unit: "match" },
    { n: together.sets, unit: "set" },
    { n: together.days, unit: "day" },
  ]
    .filter((p) => p.n > 0)
    .map((p) => `${p.n} ${p.unit}${p.n === 1 ? "" : "s"}`);
  return parts.length > 0 ? parts.join(", ") : null;
}

function StatValue({
  value,
  better,
  label,
  className,
}: {
  value: number | null;
  better: boolean;
  label: string;
  className?: string;
}) {
  return (
    <span
      aria-label={`${label}${better ? ", better" : ""}`}
      className={cn(
        "text-sm tabular-nums",
        better ? "text-ac-gold font-bold" : "text-ac-cream/80",
        className,
      )}
    >
      {value === null ? "--" : formatStat(value)}
      {better ? " ▲" : null}
    </span>
  );
}

function formatStat(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}
