import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { connection } from "next/server";
import { getMember } from "./data";
import { getAllMembers } from "prisma/lib/members";
import { Skeleton } from "@/components/ui/skeleton";
import { ARENA_BAR } from "@/components/arcade/arena-colors";
import {
  Breadcrumbs,
  Eyebrow,
  HpBar,
  PixelPortrait,
  ArcadeButton,
  Heading,
} from "@/components/arcade/ui";
import { getArenas, getRoster, sorryRanks, sorryScale } from "@/lib/rdc-stats";
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
      <div className="bg-ac-ink">
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
  // Roster and record keys are lowercase; URLs may not be.
  const key = slug.toLowerCase();
  const [member, roster, arenas] = await Promise.all([
    getMember(slug),
    getRoster(),
    getArenas(),
  ]);

  if (!member.success || !member.data || slug === "__placeholder__") notFound();

  const index = roster.findIndex((f) => f.slug === key);
  const fighter = roster[index];
  if (!fighter) notFound();

  const sorryRank = sorryRanks(sorryScale(roster, arenas)).get(key);
  const wins = {
    matches: member.data.matchWins.length,
    sets: member.data.setWins.length,
    days: member.data.dayWins.length,
  };
  const name = member.data.playerName;

  return (
    <div data-testid="member-detail-content">
      <section className="ac-dusk relative overflow-hidden [--sun-x:80%]">
        <div className="mx-auto grid max-w-6xl items-end gap-8 px-4 pt-6 md:grid-cols-[18rem_1fr]">
          <PixelPortrait
            src={fighter.art.portrait}
            alt={name}
            sizes="300px"
            priority
            pixels={56}
            className="border-ac-red animate-rise-in aspect-[4/5] w-56 border-4 md:w-full"
          />
          <div className="pb-10">
            <Eyebrow>
              Fighter profile · No.{String(index + 1).padStart(2, "0")}
            </Eyebrow>
            <h1 className="ac-title text-ac-cream animate-slam-in mt-2 text-5xl md:text-6xl">
              {name}
            </h1>
            <p className="ac-label text-ac-cream mt-1 tracking-wider">
              Sorry rank{" "}
              <span className="text-ac-gold">
                #{sorryRank ?? "--"} / {roster.length}
              </span>
            </p>
            <div className="border-ac-cream bg-ac-ink/70 mt-4 max-w-md border-2 p-3">
              <div className="ac-label mb-2 flex justify-between">
                <span className="text-ac-gold">Health</span>
                <span className="text-ac-cream">
                  {fighter.wins ? `${fighter.wins} MK8 wins` : "No wins yet"}
                </span>
              </div>
              <HpBar
                value={fighter.hp}
                variant="p1"
                className="h-4"
                label={`${name} health`}
              />
            </div>
          </div>
        </div>
      </section>

      <section className="ac-grid bg-ac-ink">
        <div className="mx-auto max-w-6xl px-4 py-12">
          <Heading lead="Win summary" className="text-ac-gold mb-6" />
          <dl className="grid gap-5 sm:grid-cols-3">
            <WinBox
              label="Matches won"
              value={wins.matches}
              tone="border-ac-gold text-ac-gold"
            />
            <WinBox
              label="Sets won"
              value={wins.sets}
              tone="border-[#6b8cff] text-[#6b8cff]"
            />
            <WinBox
              label="Days won"
              value={wins.days}
              tone="border-ac-red text-ac-red"
            />
          </dl>
          {wins.matches === 0 ? (
            <p className="text-ac-cream/70 mt-3">
              The first one is always the hardest.
            </p>
          ) : null}
        </div>
      </section>

      <section className="bg-black">
        <div className="mx-auto max-w-6xl px-4 py-12">
          <div className="mb-6 flex items-end justify-between">
            <Heading lead="Record by stage" />
            <p className="text-ac-cream/70 text-sm">
              Lower avg. rank is better.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] border-separate border-spacing-y-2">
              <thead>
                <tr className="ac-label text-ac-cream/70 text-left">
                  <th className="px-4 font-bold">Stage</th>
                  <th className="px-4 text-right font-bold">Avg rank</th>
                  <th className="px-4 text-right font-bold">Matches</th>
                  <th className="px-4 text-right font-bold">Sets</th>
                  <th className="px-4 text-right font-bold">Days</th>
                  <th className="sr-only">Link</th>
                </tr>
              </thead>
              <tbody>
                {arenas.map((arena) => {
                  const r = arena.records[key];
                  return (
                    <tr key={arena.slug} className="bg-ac-ink">
                      <td className="relative py-3 pr-4 pl-6">
                        <span
                          className={cn(
                            "absolute inset-y-0 left-0 w-1.5",
                            ARENA_BAR[arena.slug],
                          )}
                        />
                        <span className="ac-label text-ac-cream/60 mr-3">
                          {String(arena.index).padStart(2, "0")}
                        </span>
                        <span className="ac-title text-ac-cream text-xs">
                          {arena.name}
                        </span>
                      </td>
                      <Num>{r?.avgPos ? r.avgPos.toFixed(1) : "--.-"}</Num>
                      <Num>{r?.matches ?? 0}</Num>
                      <Num>{r?.sets ?? 0}</Num>
                      <Num>{r?.days ?? 0}</Num>
                      <td className="px-4 text-right">
                        <Link
                          href={`/games/${arena.slug}`}
                          className="ac-label text-ac-gold hover:text-ac-cream"
                        >
                          ▶ Stage
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

      <section className="bg-ac-ink">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-12">
          <div>
            <p className="ac-title text-ac-gold text-sm">
              Think you can take {name}?
            </p>
            <p className="text-ac-cream/70">
              Put {name} up against anyone on the roster.
            </p>
          </div>
          <ArcadeButton href="/members" variant="red">
            Pick a challenger ▶
          </ArcadeButton>
        </div>
      </section>
    </div>
  );
}

function WinBox({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: string;
}) {
  return (
    <div className={cn("bg-ac-panel border-4 p-5", tone.split(" ")[0])}>
      <dt className="ac-label text-ac-cream/80">{label}</dt>
      <dd className={cn("ac-title text-5xl", tone.split(" ")[1])}>{value}</dd>
    </div>
  );
}

const Num = ({ children }: { children: React.ReactNode }) => (
  <td className="text-ac-cream px-4 text-right text-2xl tabular-nums">
    {children}
  </td>
);
