import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { connection } from "next/server";
import { getMember } from "./data";
import { getAllMembers } from "prisma/lib/members";
import { Skeleton } from "@/components/ui/skeleton";
import { ARENA_BAR } from "@/components/versus/arena-card";
import {
  Breadcrumbs,
  Eyebrow,
  HpBar,
  SkewPortrait,
  VsButton,
  VsHeading,
} from "@/components/versus/ui";
import { getArenas, getRoster, sorryScale } from "@/lib/rdc-stats";
import { cn } from "@/lib/utils";

export async function generateStaticParams() {
  const members = await getAllMembers();
  if (!members.success || !members.data || members.data.length === 0) {
    console.error("Failed to fetch members");
    return [{ slug: "__placeholder__" }];
  }
  return members.data.map((member) => ({
    slug: member.playerName.toLowerCase(),
  }));
}

export default function Page({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  return (
    <>
      <div className="bg-vs-ink">
        <div
          className="mx-auto max-w-6xl px-4 pt-6"
          data-testid="member-detail-shell-marker"
        >
          <Breadcrumbs
            items={[
              { label: "Home", href: "/" },
              { label: "Members", href: "/members" },
              { label: "Fighter" },
            ]}
          />
        </div>
      </div>
      <Suspense fallback={<Skeleton className="mx-auto h-96 max-w-6xl" />}>
        <MemberDetailContent params={params} />
      </Suspense>
    </>
  );
}

async function MemberDetailContent({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  await connection();
  const { slug } = await params;
  const [member, roster, arenas] = await Promise.all([
    getMember(slug),
    getRoster(),
    getArenas(),
  ]);

  if (!member.success || !member.data || slug === "__placeholder__") notFound();

  const index = roster.findIndex((f) => f.slug === slug);
  const fighter = roster[index];
  if (!fighter) notFound();

  const ranked = sorryScale(roster, arenas)
    .filter((e) => e.avgRank !== null)
    .sort((a, b) => a.avgRank! - b.avgRank!);
  const sorryRank = ranked.findIndex((e) => e.fighter.slug === slug);
  const wins = {
    matches: member.data.matchWins.length,
    sets: member.data.setWins.length,
    days: member.data.dayWins.length,
  };
  const name = member.data.playerName;

  return (
    <div data-testid="member-detail-content">
      <section className="vs-dusk relative overflow-hidden [--sun-x:80%]">
        <div className="mx-auto grid max-w-6xl items-end gap-8 px-4 pt-6 md:grid-cols-[18rem_1fr]">
          <SkewPortrait
            src={fighter.art.portrait}
            alt={name}
            sizes="300px"
            priority
            className="animate-rise-in aspect-[4/5] w-56 md:w-full"
          />
          <div className="pb-10">
            <Eyebrow>Fighter No.{String(index + 1).padStart(2, "0")}</Eyebrow>
            <h1 className="vs-title text-vs-cream animate-slam-in mt-2 text-8xl md:text-[9rem]">
              {name}
            </h1>
            <p className="vs-label text-vs-cream mt-1 tracking-wider">
              Sorry rank{" "}
              <span className="text-vs-gold">
                #{sorryRank === -1 ? "--" : sorryRank + 1} / {roster.length}
              </span>
            </p>
            <div className="border-vs-cream bg-vs-ink/70 mt-4 max-w-md border-2 p-3">
              <div className="vs-label mb-2 flex justify-between">
                <span className="text-vs-gold">Health</span>
                <span className="text-vs-cream">
                  {fighter.wins ? `${fighter.wins} MK8 wins` : "No wins yet"}
                </span>
              </div>
              <HpBar value={fighter.hp} variant="p1" className="h-4" label={`${name} health`} />
            </div>
          </div>
        </div>
      </section>

      <section className="bg-vs-ink">
        <div className="mx-auto max-w-6xl px-4 py-12">
          <VsHeading lead="Win" accent="summary" className="mb-6" />
          <dl className="grid gap-5 sm:grid-cols-3">
            <WinBox label="Matches won" value={wins.matches} tone="border-vs-gold text-vs-gold" />
            <WinBox label="Sets won" value={wins.sets} tone="border-[#6b8cff] text-[#6b8cff]" />
            <WinBox label="Days won" value={wins.days} tone="border-vs-red text-vs-red" />
          </dl>
          {wins.matches === 0 ? (
            <p className="text-vs-cream/70 mt-3">The first one is always the hardest.</p>
          ) : null}
        </div>
      </section>

      <section className="bg-vs-panel border-vs-gold border-t-4">
        <div className="mx-auto max-w-6xl px-4 py-12">
          <div className="mb-6 flex items-end justify-between">
            <VsHeading lead="Record by" accent="arena" tone="blue" />
            <p className="text-vs-cream/70 text-sm">Lower avg. rank is better.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] border-separate border-spacing-y-2">
              <thead>
                <tr className="vs-label text-vs-cream/70 text-left">
                  <th className="px-4 font-bold">Arena</th>
                  <th className="px-4 text-right font-bold">Avg rank</th>
                  <th className="px-4 text-right font-bold">Matches</th>
                  <th className="px-4 text-right font-bold">Sets</th>
                  <th className="px-4 text-right font-bold">Days</th>
                  <th className="sr-only">Link</th>
                </tr>
              </thead>
              <tbody>
                {arenas.map((arena) => {
                  const r = arena.records[slug];
                  return (
                    <tr key={arena.slug} className="bg-vs-ink">
                      <td className="relative py-3 pr-4 pl-6">
                        <span className={cn("absolute inset-y-0 left-0 w-1.5", ARENA_BAR[arena.slug])} />
                        <span className="vs-label text-vs-cream/60 mr-3">
                          {String(arena.index).padStart(2, "0")}
                        </span>
                        <span className="vs-title text-vs-cream text-2xl">{arena.name}</span>
                      </td>
                      <Num>{r?.avgPos ? r.avgPos.toFixed(1) : "--.-"}</Num>
                      <Num>{r?.matches ?? 0}</Num>
                      <Num>{r?.sets ?? 0}</Num>
                      <Num>{r?.days ?? 0}</Num>
                      <td className="px-4 text-right">
                        <Link href={`/games/${arena.slug}`} className="vs-label text-vs-gold hover:text-vs-cream">
                          Fight ▶
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="bg-vs-ink">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-12">
          <div>
            <p className="vs-title text-vs-gold text-4xl">Think you can take {name}?</p>
            <p className="text-vs-cream/70">Put {name} up against anyone on the roster.</p>
          </div>
          <VsButton href="/members" variant="red">
            Pick a challenger ▶
          </VsButton>
        </div>
      </section>
    </div>
  );
}

function WinBox({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className={cn("bg-vs-panel border-4 p-5", tone.split(" ")[0])}>
      <dt className="vs-label text-vs-cream/80">{label}</dt>
      <dd className={cn("vs-title text-8xl", tone.split(" ")[1])}>{value}</dd>
    </div>
  );
}

const Num = ({ children }: { children: React.ReactNode }) => (
  <td className="vs-title text-vs-cream px-4 text-right text-2xl tabular-nums not-italic">
    {children}
  </td>
);
