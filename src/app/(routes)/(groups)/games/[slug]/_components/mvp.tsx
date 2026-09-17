import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import type { QueryResponseData } from "prisma/db";
import type { getAllSessionsByGame } from "prisma/lib/admin";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { analyzeMvp } from "@/app/ai/actions";
import { getSetsData, ProcessedSet } from "./match-data";
import { capitalizeFirst } from "@/lib/utils";
import type { MvpOutput } from "@/app/ai/types";
import { findPlayer } from "@/app/(routes)/admin/_utils/player-mappings";

type Sessions = QueryResponseData<
  Awaited<ReturnType<typeof getAllSessionsByGame>>
>;

// Allow streaming responses up to 30 seconds

export const MVP = ({
  session,
  defaultMvp = null,
}: {
  session: Sessions[0];
  defaultMvp: MvpOutput | null;
}) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [mvp, setMvp] = useState<MvpOutput | null>(defaultMvp);
  // const [generation, setGeneration] = useState<string | null>(null);

  return (
    <Card className="relative h-[400px] overflow-auto">
      <div className="from-primary/10 pointer-events-none absolute top-0 right-0 h-full w-1/2 bg-gradient-to-l to-transparent" />
      <CardHeader>
        <CardTitle className="flex items-center gap-2">MVP</CardTitle>
        <CardDescription>Match Statistics</CardDescription>
      </CardHeader>
      <CardContent>
        {mvp ? (
          <div className="relative space-y-6">
            <div className="flex items-center gap-4">
              <Avatar className="border-primary/20 sticky top-2 h-16 w-16 border-2">
                <AvatarImage
                  src={findPlayer(mvp.player)?.image || ""}
                  alt={mvp.player}
                />
                <AvatarFallback>{mvp.player[0]}</AvatarFallback>
              </Avatar>
              <div>
                <h3 className="sticky top-2 bg-inherit text-xl font-bold">
                  {mvp.player}
                </h3>
                <p className="text-muted-foreground text-sm">
                  {mvp.description}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {mvp.stats.map((stat) => (
                <div
                  key={stat.statName}
                  className="bg-muted space-y-1 rounded-lg p-3"
                >
                  <p className="text-sm font-medium">
                    {capitalizeFirst(stat.statName)}
                  </p>
                  <p className="text-2xl font-bold tracking-tight">
                    {stat.sum}
                  </p>
                  {stat.average !== undefined && (
                    <p className="text-muted-foreground text-xs">
                      {stat.average} per game
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <>
            <p>No MVP has been decided yet, would you like to do the honors?</p>
            <Button
              className="cursor-pointer disabled:cursor-auto"
              disabled={isSubmitting}
              onClick={async () => {
                setIsSubmitting(true);
                try {
                  const stats = getSetsData(session);
                  console.log({ stats });
                  const mvp = await analyzeMvp(
                    stats as ProcessedSet[],
                    session.sessionId,
                  );
                  setMvp(mvp);
                } catch (error) {
                  console.log("Unexpected error", error);
                } finally {
                  setIsSubmitting(false);
                }
              }}
            >
              Who is the real MVP?
            </Button>
            {isSubmitting && (
              <p className="text-muted-foreground text-sm">Generating...</p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
};
