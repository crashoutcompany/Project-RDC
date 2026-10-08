import { useFormContext } from "react-hook-form";
import { H2 } from "@/components/headings";
import { FormValues } from "../../_utils/form-helpers";
import PlayerAvatar from "./PlayerAvatar";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { Card, CardHeader } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface FormSummaryProps {
  defaultValues?: FormValues;
}

export const FormSummary = ({ defaultValues }: FormSummaryProps) => {
  const formContext = useFormContext<FormValues>();
  const sets = defaultValues?.sets || formContext?.getValues("sets") || [];
  const [openSets, setOpenSets] = useState<boolean[]>(sets.map(() => false));

  const toggleSet = (index: number) => {
    setOpenSets((prev) =>
      prev.map((isOpen, i) => (i === index ? !isOpen : isOpen)),
    );
  };

  return (
    <>
      <H2>Form Summary</H2>
      <div className="@container grid gap-4">
        {sets.map((set, index) => (
          <Collapsible key={set.setId} open={openSets[index]}>
            <Card className="flex flex-col rounded-lg p-6 shadow-lg">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <div className="flex items-center gap-4">
                  <span className="text-lg font-semibold">Set {index + 1}</span>
                  <div className="flex -space-x-2">
                    {set.setWinners.map((winner) => (
                      <PlayerAvatar key={winner.playerId} player={winner} />
                    ))}
                  </div>
                </div>
                <CollapsibleTrigger onClick={() => toggleSet(index)}>
                  <ChevronDown
                    className={`transition-transform duration-300 ${openSets[index] ? "rotate-180" : ""}`}
                  />
                </CollapsibleTrigger>
              </CardHeader>
              <CollapsibleContent>
                {/* <MatchData session={defaultValues} /> */}
                {set.matches.map((match, matchIndex) => (
                  <div className="my-4" key={matchIndex}>
                    <div>Match {matchIndex + 1} Winners</div>
                    <div className="flex -space-x-2">
                      {match.matchWinners.map((winner) => (
                        <PlayerAvatar key={winner.playerId} player={winner} />
                      ))}
                    </div>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Player</TableHead>
                          {set.matches
                            .at(0)
                            ?.playerSessions.at(0)
                            ?.playerStats.toSorted(
                              (a, b) => Number(a.statId) - Number(b.statId),
                            )
                            .map((stat) => (
                              <TableHead key={stat.statId}>
                                <div className="flex flex-col text-sm">
                                  <p className="text-muted-foreground">
                                    {stat.stat}
                                  </p>
                                </div>
                              </TableHead>
                            ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {match.playerSessions.map((ps) => (
                          <TableRow
                            key={ps.playerId}
                            className="hover:bg-muted/50"
                          >
                            <TableCell className="flex items-center gap-2">
                              <PlayerAvatar
                                key={ps.playerId}
                                player={{
                                  playerId: ps.playerId,
                                  playerName: ps.playerSessionName,
                                }}
                              />
                              <span>{ps.playerSessionName}</span>
                            </TableCell>
                            {ps.playerStats
                              .toSorted(
                                (a, b) => Number(a.statId) - Number(b.statId),
                              )
                              .map((stat) => (
                                <TableCell
                                  key={`match-${matchIndex}-player-${ps.playerId}-stat-${stat.statId}`}
                                  className="px-3 py-2"
                                >
                                  {stat.statValue}
                                </TableCell>
                              ))}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ))}
              </CollapsibleContent>
            </Card>
          </Collapsible>
        ))}
      </div>
    </>
  );
};
