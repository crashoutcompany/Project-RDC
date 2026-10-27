import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { connection } from "next/server";
import {
  getApprovedSession,
  getApprovedSessionIds,
} from "prisma/lib/public-session";
import { getSetsData } from "@/lib/mvp/process-sets";
import SessionBreakdown from "./_components/session-breakdown";
import { findPlayer } from "@/app/(routes)/admin/_utils/player-mappings";
import { mvpStatsSchema } from "@/app/ai/types";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArcadeButton,
  Breadcrumbs,
  Eyebrow,
  Heading,
} from "@/components/arcade/ui";
import { capitalizeFirst, formatSessionDate } from "@/lib/utils";

type Params = Promise<{ id: string }>;

const gameSlug = (gameName: string) =>
  gameName.replace(/\s/g, "").toLowerCase();

export async function generateStaticParams() {
  const sessions = await getApprovedSessionIds();
  if (!sessions.success || !sessions.data || sessions.data.length === 0)
    return [{ id: "__placeholder__" }];
  return sessions.data.map((s) => ({ id: String(s.sessionId) }));
}

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const { id } = await params;
  const session = await loadSession(id);
  if (!session) return { title: "Session not found | RDC Stats Tracker" };

  const winners = session.dayWinners.map((p) => p.playerName).join(", ");
  const description = [
    `${session.Game.gameName} session on ${formatSessionDate(session.date)}.`,
    winners ? `Day won by ${winners}.` : null,
  ]
    .filter(Boolean)
    .join(" ");

  return {
    title: `${session.sessionName} | RDC Stats Tracker`,
    description,
  };
}

export default function Page({ params }: { params: Params }) {
  return (
    <>
      <div className="bg-ac-ink">
        <div
          className="mx-auto max-w-6xl px-4 pt-6"
          data-testid="session-detail-shell-marker"
        />
      </div>
      <Suspense fallback={<Skeleton className="mx-auto h-96 max-w-6xl" />}>
        <SessionDetailContent params={params} />
      </Suspense>
    </>
  );
}

/** Returns the approved session, or null for a non-numeric id, a placeholder, or a missing/unapproved row. */
async function loadSession(id: string) {
  if (!/^\d+$/.test(id)) return null;
  const result = await getApprovedSession(Number(id));
  return result.success && result.data ? result.data : null;
}

async function SessionDetailContent({ params }: { params: Params }) {
  await connection();
  const { id } = await params;
  const session = await loadSession(id);
  if (!session) notFound();

  const { Game, sets, dayWinners, mvp, mvpStats, mvpDescription } = session;
  const slug = gameSlug(Game.gameName);
  const matchCount = sets.reduce((acc, set) => acc + set.matches.length, 0);
  const statsParsed = mvpStatsSchema.safeParse(mvpStats);
  const hasSetData = getSetsData(session).length > 0;
  const mvpImage = mvp ? findPlayer(mvp.playerName)?.image || "" : "";

  return (
    <div data-testid="session-detail-content">
      <section className="ac-dusk relative overflow-hidden">
        <div className="mx-auto max-w-6xl px-4 pt-6 pb-12">
          <Breadcrumbs
            items={[
              { label: "Home", href: "/" },
              { label: "Games", href: "/games" },
              { label: Game.gameName, href: `/games/${slug}` },
              { label: session.sessionName },
            ]}
          />
          <Eyebrow>
            {Game.gameName} · {formatSessionDate(session.date)}
          </Eyebrow>
          <h1 className="ac-title text-ac-cream animate-slam-in mt-3 text-4xl md:text-5xl">
            {session.sessionName}
          </h1>
          <div className="mt-6 flex flex-wrap items-center gap-4">
            <ArcadeButton href={`/games/${slug}`} variant="dark">
              ◀ {Game.gameName} dashboard
            </ArcadeButton>
            <a
              href={session.sessionUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="ac-label text-ac-gold hover:text-ac-cream"
            >
              Watch on YouTube ▶
            </a>
          </div>
        </div>
      </section>

      <section className="bg-black">
        <div className="mx-auto max-w-6xl px-4 py-12">
          <div className="border-ac-gold relative aspect-video w-full border-4 bg-black">
            <iframe
              src={`https://www.youtube-nocookie.com/embed/${encodeURIComponent(session.videoId)}`}
              title={session.sessionName}
              loading="lazy"
              allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin"
              className="absolute inset-0 h-full w-full"
            />
          </div>
        </div>
      </section>

      <section className="ac-grid bg-ac-ink">
        <div className="mx-auto grid max-w-6xl gap-6 px-4 py-12 md:grid-cols-3">
          <div className="bg-ac-panel border-4 border-[#6b8cff] p-5">
            <p className="ac-label text-ac-cream/80">Sets</p>
            <p className="ac-title text-5xl text-[#6b8cff]">{sets.length}</p>
          </div>
          <div className="bg-ac-panel border-ac-gold border-4 p-5">
            <p className="ac-label text-ac-cream/80">Matches</p>
            <p className="ac-title text-ac-gold text-5xl">{matchCount}</p>
          </div>
          <div className="bg-ac-panel border-ac-red border-4 p-5">
            <p className="ac-label text-ac-cream/80">Day winners</p>
            <p className="ac-title text-ac-red mt-2 text-2xl">
              {dayWinners.length
                ? dayWinners.map((p) => p.playerName).join(", ")
                : "Not recorded"}
            </p>
          </div>
        </div>
      </section>

      {mvp && statsParsed.success ? (
        <section className="bg-black">
          <div className="mx-auto max-w-6xl px-4 py-12">
            <Heading lead="Session" accent="MVP" tone="gold" className="mb-6" />
            <div className="bg-ac-panel border-ac-gold flex flex-col gap-6 border-4 p-6 md:flex-row">
              <div className="flex items-start gap-4 md:w-1/3">
                <div className="border-ac-gold relative size-20 shrink-0 border-4">
                  {mvpImage ? (
                    <Image
                      src={mvpImage}
                      alt={mvp.playerName}
                      fill
                      sizes="80px"
                      className="object-cover"
                    />
                  ) : null}
                </div>
                <div>
                  <p className="ac-title text-ac-cream text-xl">
                    {mvp.playerName}
                  </p>
                  {mvpDescription ? (
                    <p className="text-ac-cream/75 mt-2">{mvpDescription}</p>
                  ) : null}
                </div>
              </div>
              <dl className="grid flex-1 grid-cols-2 gap-3 md:grid-cols-3">
                {statsParsed.data.map((stat) => (
                  <div key={stat.statName} className="bg-ac-ink p-3">
                    <dt className="ac-label text-ac-cream/70">
                      {capitalizeFirst(stat.statName)}
                    </dt>
                    <dd className="ac-title text-ac-cream text-2xl tabular-nums">
                      {stat.sum}
                    </dd>
                    {stat.average !== undefined ? (
                      <p className="text-ac-cream/60 text-xs">
                        {stat.average} per game
                      </p>
                    ) : null}
                  </div>
                ))}
              </dl>
            </div>
          </div>
        </section>
      ) : null}

      {hasSetData ? (
        <section className="bg-ac-ink">
          <div className="mx-auto max-w-6xl px-4 py-12">
            <Heading
              lead="Set"
              accent="breakdown"
              tone="blue"
              className="mb-6"
            />
            <SessionBreakdown session={session} />
          </div>
        </section>
      ) : null}
    </div>
  );
}
