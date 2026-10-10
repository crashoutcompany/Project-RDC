import type { PrismaClient } from "@/generated/prisma/client";
import type { DraftSession } from "./build-draft";

export const HARVESTER_AUTHOR = "scoreboard-harvester";

export interface VideoMeta {
  videoId: string;
  title: string;
  url: string;
  thumbnail: string;
  /** When the video was published (sessions are dated by upload). */
  date: Date;
}

export type WriteDraftResult =
  | { status: "created"; sessionId: number }
  | { status: "exists"; sessionId: number }
  | { status: "empty" };

/**
 * Saves a drafted session as `isApproved: false`, so it lands in
 * /admin/submissions and stays off public pages until an admin reviews and
 * approves it. Mirrors `insertNewSessionFromAdmin`, but inserts sequentially
 * so match IDs follow the order games were played.
 *
 * Idempotent per (game, video): an existing session — draft or approved —
 * is left alone.
 */
export async function writeDraftSession(args: {
  prisma: PrismaClient;
  gameId: number;
  video: VideoMeta;
  draft: DraftSession;
}): Promise<WriteDraftResult> {
  const { prisma, gameId, video, draft } = args;
  if (draft.sets.length === 0) return { status: "empty" };

  const existing = await prisma.session.findFirst({
    where: { gameId, videoId: video.videoId },
    select: { sessionId: true },
  });
  if (existing) return { status: "exists", sessionId: existing.sessionId };

  const gameStats = await prisma.gameStat.findMany({ where: { gameId } });
  const statIds = new Map(gameStats.map((gs) => [gs.statName, gs.statId]));

  const sessionId = await prisma.$transaction(
    async (tx) => {
      const session = await tx.session.create({
        data: {
          gameId,
          sessionName: video.title,
          sessionUrl: video.url,
          thumbnail: video.thumbnail,
          date: video.date,
          videoId: video.videoId,
          isApproved: false,
          createdBy: HARVESTER_AUTHOR,
        },
      });

      for (const set of draft.sets) {
        const newSet = await tx.gameSet.create({
          data: {
            sessionId: session.sessionId,
            setWinners: {
              connect: set.winnerIds.map((playerId) => ({ playerId })),
            },
          },
        });

        for (const match of set.matches) {
          const newMatch = await tx.match.create({
            data: {
              setId: newSet.setId,
              date: video.date,
              matchWinners: {
                connect: match.winnerIds.map((playerId) => ({ playerId })),
              },
            },
          });

          for (const player of match.players) {
            const playerSession = await tx.playerSession.create({
              data: {
                playerId: player.playerId,
                sessionId: session.sessionId,
                matchId: newMatch.matchId,
                setId: newSet.setId,
              },
            });

            const stats = player.stats.flatMap((stat) => {
              const statId = statIds.get(stat.stat);
              if (statId === undefined) return [];
              return [
                {
                  playerId: player.playerId,
                  gameId,
                  playerSessionId: playerSession.playerSessionId,
                  statId,
                  value: stat.statValue,
                  date: video.date,
                },
              ];
            });
            if (stats.length > 0) await tx.playerStat.createMany({ data: stats });
          }
        }
      }

      return session.sessionId;
    },
    // Sequential inserts over the Neon HTTP adapter take a few seconds for a
    // 20-match session; the 5s default is too tight.
    { timeout: 60_000, maxWait: 10_000 },
  );

  return { status: "created", sessionId };
}
