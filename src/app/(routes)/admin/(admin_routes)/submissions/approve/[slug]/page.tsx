import { getSessionById } from "prisma/lib/session";
import { FormValues } from "../../../../_utils/form-helpers";
import { ApproveSessionForm } from "../_components/ApproveSessionForm";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";

export default function Page({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  return (
    <div className="container mx-auto py-6">
      <h1 className="mb-4 text-2xl font-bold" data-testid="admin-approve-shell-marker">
        Review Session
      </h1>
      <Suspense fallback={<Skeleton className="h-72 w-full" />}>
        <Component params={params} />
      </Suspense>
    </div>
  );
}

const Component = async ({ params }: { params: Promise<{ slug: string }> }) => {
  const sessionId = parseInt((await params).slug);

  if (isNaN(sessionId))
    return <div className="container mx-auto py-6">Invalid session ID</div>;

  const session = await getSessionById(sessionId);

  if (!session?.data) {
    return <div className="container mx-auto py-6">Session not found</div>;
  }

  // Only these playerName values are allowed
  type AllowedName =
    | "Mark"
    | "Dylan"
    | "Ben"
    | "Lee"
    | "Des"
    | "John"
    | "Aff"
    | "Ipi";

  // Map to collect unique players by playerId
  const playerMap = new Map<
    number,
    { playerId: number; playerName: AllowedName }
  >();

  // Iterate every set, every match, every player session
  for (const set of session.data.sets) {
    for (const match of set.matches) {
      for (const ps of match.playerSessions) {
        const name = ps.player.playerName as AllowedName;
        playerMap.set(ps.player.playerId, {
          playerId: ps.player.playerId,
          playerName: name,
        });
      }
    }
  }

  // Final list of unique players
  const players = Array.from(playerMap.values());

  const sessionData = session.data;

  const game = sessionData.Game.gameName as
    | "Call of Duty"
    | "Mario Kart 8"
    | "Rocket League"
    | "Lethal Company"
    | "Speedrunners";

  const defaultValues: FormValues = {
    game,
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
    })),
  };

  return (
    <div data-testid="admin-approve-content">
      <ApproveSessionForm defaultValues={defaultValues} sessionId={sessionId} />
    </div>
  );
};
