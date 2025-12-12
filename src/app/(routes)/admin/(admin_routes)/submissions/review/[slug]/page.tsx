import prisma from "prisma/db";
import { notFound } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { EditStatus, Player } from "@/generated/prisma/client";
import { ProposedData } from "@/app/actions/editSession";
import { SessionChangesWrapper } from "../_components/Changes";
import { Status } from "../_components/Status";
import { H1, H2 } from "@/components/headings";
import { ApproveButton, DeclineButton } from "../_components/ActionButtons";

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const sessionId = parseInt((await params).slug);
  if (isNaN(sessionId)) notFound();

  const [session, editRequests] = await fetchEditRequests(sessionId);

  if (!session) notFound();

  return (
    <div className="container mx-auto py-8">
      <H1>Review Session: {session.sessionName}</H1>
      <H2 className="text-muted-foreground mt-2 text-sm">
        Game: {session.Game?.gameName}
      </H2>
      <Card className="my-2">
        <CardContent className="p-6">
          {editRequests.length === 0 ? (
            <p className="text-muted-foreground">No revision history found.</p>
          ) : (
            <div className="space-y-6">
              {editRequests.map((edit) => {
                let parsedJson: ProposedData;
                try {
                  parsedJson = JSON.parse(edit.proposedData) as ProposedData;
                } catch {
                  return (
                    <div key={edit.id} className="space-y-2">
                      <p className="text-destructive">
                        Error parsing edit request data.
                      </p>
                      <Separator className="mt-4" />
                    </div>
                  );
                }

                return (
                  <div key={edit.id} className="relative space-y-2">
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="font-medium">
                          Edited by {edit.proposer?.name || "Unknown"}
                        </h3>
                        <p className="text-muted-foreground text-sm">
                          {new Date(edit.createdAt).toLocaleString()}
                        </p>
                      </div>
                      <Status status={edit.status} />
                    </div>

                    <div className="py-2 pl-4">
                      <h4 className="mb-1 text-sm font-medium">Changes:</h4>
                      <div className="bg-muted space-y-2 rounded p-4">
                        {session.sets.length !==
                          parsedJson.proposedData.sets.length && (
                          <h4 className="mb-1 text-sm font-medium">
                            New number of sets:{" "}
                            {parsedJson.proposedData.sets.length}
                          </h4>
                        )}
                        {session?.sets.map((set, setIdx) => (
                          <div key={setIdx}>
                            {parsedJson.proposedData.sets[setIdx] &&
                              set.matches.length !==
                                parsedJson.proposedData.sets[setIdx].matches
                                  .length && (
                                <h4 className="mb-1 text-sm font-medium">
                                  New number of matches:
                                  {
                                    parsedJson.proposedData.sets[setIdx].matches
                                      .length
                                  }
                                </h4>
                              )}
                            {parsedJson.proposedData.sets[setIdx] && (
                              <SessionChangesWrapper
                                set={set}
                                json={parsedJson}
                                setIndex={setIdx}
                              />
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    {edit.reviewedAt && (
                      <div className="text-muted-foreground pl-4 text-sm">
                        <p>
                          {edit.status} by {edit.reviewer?.name || "Unknown"} on{" "}
                          {new Date(edit.reviewedAt).toLocaleString()}
                        </p>
                        {edit.reviewNote && (
                          <p className="mt-1">Note: {edit.reviewNote}</p>
                        )}
                      </div>
                    )}
                    {edit.status === "PENDING" ? (
                      <div className="flex gap-2">
                        <ApproveButton editId={edit.id} />
                        <DeclineButton editId={edit.id} />
                      </div>
                    ) : null}
                    <Separator className="mt-4" />
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export type Session = {
  sessionId: number;
  sessionName: string;
  Game: {
    gameName: string;
  } | null;
  sets: {
    setId: number;
    setWinners: { playerId: number; playerName: string }[];
    matches: {
      matchId: number;
      matchWinners: Player[]; // kept generic since shape isn't used
      playerSessions: {
        playerStats: Array<{
          statId: number | string;
          value: string;
          gameStat: {
            statName: string;
          };
        }>;
      }[];
    }[];
  }[];
};

type EditRequest = {
  id: number;
  status: EditStatus;
  proposedData: string;
  createdAt: Date;
  reviewedAt: Date | null;
  reviewNote: string | null;
  proposer: { name: string | null } | null;
  reviewer: { name: string | null } | null;
};

const fetchEditRequests = async (
  sessionId: number,
): Promise<[Session | null, EditRequest[]]> => {
  return Promise.all([
    prisma.session.findUnique({
      where: { sessionId },
      include: {
        Game: {
          select: {
            gameName: true,
          },
        },
        sets: {
          include: {
            setWinners: true,
            matches: {
              include: {
                matchWinners: true,
                playerSessions: {
                  include: {
                    playerStats: {
                      include: {
                        gameStat: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    }),
    prisma.sessionEditRequest.findMany({
      where: { sessionId },
      select: {
        proposedData: true,
        id: true,
        status: true,
        createdAt: true,
        reviewedAt: true,
        reviewNote: true,
        proposer: { select: { name: true } },
        reviewer: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
  ]) as Promise<[Session | null, EditRequest[]]>;
};
