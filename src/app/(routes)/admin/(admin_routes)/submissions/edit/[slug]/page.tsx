import EntryCreatorForm from "../../../../_components/form/EntryCreatorForm";
import { handlePrismaOperation } from "prisma/db";
import { Player } from "@/generated/prisma/client";
import { FormValues } from "../../../../_utils/form-helpers";

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const sessionId = parseInt((await params).slug);

  if (isNaN(sessionId))
    return <div className="container mx-auto py-6">Invalid session ID</div>;

  const session = await handlePrismaOperation((prisma) =>
    prisma.session.findUnique({
      where: { sessionId },
      include: {
        Game: { select: { gameName: true } },
        sets: {
          include: {
            setWinners: true,
            matches: {
              include: {
                matchWinners: true,
                playerSessions: {
                  include: {
                    player: true,
                    playerStats: {
                      include: {
                        player: true,
                        gameStat: {
                          select: {
                            statName: true,
                            statId: true,
                            type: true,
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        dayWinners: true,
        mvp: true,
      },
    }),
  );

  if (!session?.data) {
    return <div className="container mx-auto py-6">Session not found</div>;
  }

  const players = new Set<
    Player & {
      playerName:
        | "Mark"
        | "Dylan"
        | "Ben"
        | "Lee"
        | "Des"
        | "John"
        | "Aff"
        | "Ipi";
    }
  >(
    session.data.sets
      .at(0)
      ?.matches.at(0)
      ?.playerSessions.map((playerSession) => {
        return {
          playerId: playerSession.player.playerId,
          playerName: playerSession.player.playerName as
            | "Mark"
            | "Dylan"
            | "Ben"
            | "Lee"
            | "Des"
            | "John"
            | "Aff"
            | "Ipi",
        };
      }) || [],
  );

  const sessionData = session.data;

  const game = sessionData.Game.gameName as
    | "Call of Duty"
    | "Mario Kart 8"
    | "Rocket League"
    | "Lethal Company"
    | "Speedrunners";

  const defaultValues: FormValues = {
    game,
    sessionId: sessionData.sessionId,
    sessionName: sessionData.sessionName,
    sessionUrl: sessionData.sessionUrl,
    thumbnail: sessionData.thumbnail,
    videoId: sessionData.videoId,
    date: new Date(sessionData.date),
    players: Array.from(players),
    // @ts-expect-error Stat Name not conforming to player names
    sets: sessionData.sets.map((set) => ({
      setId: set.setId,
      matches: set.matches.map((match) => ({
        matchWinners: match.matchWinners.map((player) => ({
          playerId: player.playerId,
          playerName: player.playerName,
        })),
        playerSessions: match.playerSessions.map((playerSession) => ({
          playerId: playerSession.player.playerId,
          playerSessionName: playerSession.player.playerName,
          playerStats: playerSession.playerStats.map((ps) => ({
            statId: String(ps.gameStat.statId),
            stat: ps.gameStat.statName,
            statValue: ps.value,
          })),
        })),
      })),
      setWinners: set.setWinners.map((player) => ({
        playerId: player.playerId,
        playerName: player.playerName,
      })),
    })), // We'll need to transform the data more carefully based on the game type
  };

  return (
    <div className="container mx-auto py-6">
      <h1 className="mb-6 text-2xl font-bold">Edit Session</h1>
      <EntryCreatorForm
        rdcMembers={Array.from(players)}
        defaultValues={defaultValues}
        type="edit"
      />
    </div>
  );
}
