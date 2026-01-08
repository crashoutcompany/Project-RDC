import { useCallback, useEffect, useState } from "react";
import { useFieldArray, useFormContext } from "react-hook-form";
import MatchManager from "./MatchManager";
import PlayerSelector from "./PlayerSelector";
import { Button } from "@/components/ui/button";
import { Card, CardFooter, CardHeader } from "@/components/ui/card";
import { TrashIcon } from "@radix-ui/react-icons";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ChevronDown } from "lucide-react";
import { FormValues, Match } from "../../_utils/form-helpers";
import WinnerDisplay from "./WinnerDisplay";
import { FormField, FormItem, FormMessage } from "@/components/ui/form";
import BulkUploadModal, { BulkProcessingResult } from "./BulkUploadModal";
import BulkReviewModal from "./BulkReviewModal";
import { Stat, VisionPlayer } from "@/lib/visionTypes";

const SetManager = () => {
  const {
    watch,
    control,
    getValues,
    setValue,
    formState: { errors },
  } = useFormContext<FormValues>();

  const { append, remove, fields } = useFieldArray({
    name: "sets",
    control,
  });

  const [openSets, setOpenSets] = useState<boolean[]>(fields.map(() => false));
  const [highestSetId, setHighestSetId] = useState(fields.length);
  
  // Bulk upload state
  const [bulkResults, setBulkResults] = useState<BulkProcessingResult[]>([]);
  const [showReviewModal, setShowReviewModal] = useState(false);

  const toggleSet = (index: number) => {
    setOpenSets((prevOpenSets) =>
      prevOpenSets.map((isOpen, i) => (i === index ? !isOpen : isOpen)),
    );
  };

  const handleAddSet = () => {
    const newSetId = highestSetId + 1;
    setHighestSetId(newSetId);
    append({
      setId: newSetId,
      matches: [],
      setWinners: [],
    });

    // Then update openSets to match new length with last set open
    setOpenSets((prev) => {
      const newLength = prev.length + 1;
      return Array(newLength)
        .fill(false)
        .map((_, i) => (i === newLength - 1 ? true : (prev[i] ?? false)));
    });
  };

  const players = watch(`players`);
  const gameName = watch(`game`);

  /**
   * Processes vision players into form-compatible player sessions
   */
  const processTeamPlayers = useCallback((teamPlayers: VisionPlayer[]) => {
    return teamPlayers.map((player) => {
      const formattedStats = player.stats.map((stat: Stat) => ({
        statId: stat.statId,
        stat: stat.stat,
        statValue: stat.statValue,
      })) as Match["playerSessions"][number]["playerStats"];

      return {
        playerId: player?.playerId || 0,
        playerSessionName: player?.name || "Unknown Player",
        playerStats: formattedStats,
      };
    });
  }, []);

  /**
   * Converts a BulkProcessingResult to a form-compatible Match object
   */
  const convertResultToMatch = useCallback(
    (result: BulkProcessingResult): Match | null => {
      if (!result.data) return null;

      const playerSessions = processTeamPlayers(result.data.players);

      const formattedWinners = (result.data.winner || []).map(
        (player: VisionPlayer) => ({
          playerId: player?.playerId || 0,
          playerName: player?.name,
        }),
      );

      return {
        matchWinners: formattedWinners,
        playerSessions: playerSessions,
      } as Match;
    },
    [processTeamPlayers],
  );

  /**
   * Handles bulk processing completion from BulkUploadModal
   */
  const handleBulkProcessingComplete = useCallback(
    (results: BulkProcessingResult[]) => {
      setBulkResults(results);
      setShowReviewModal(true);
    },
    [],
  );

  /**
   * Handles confirmation from BulkReviewModal
   * Creates new sets and adds matches to the appropriate sets
   */
  const handleBulkReviewConfirm = useCallback(
    (
      assignments: Map<number, BulkProcessingResult[]>,
      newSetIds: number[],
    ) => {
      console.log("handleBulkReviewConfirm called", {
        assignments: Array.from(assignments.entries()),
        newSetIds,
      });

      const currentSets = getValues("sets") || [];
      let updatedHighestSetId = highestSetId;

      // Build new sets with their matches already included
      const newSetsToAppend: FormValues["sets"] = [];

      // Process new sets - create them with their matches
      newSetIds.forEach((newSetId) => {
        const existingSetIndex = currentSets.findIndex(
          (s) => s.setId === newSetId,
        );
        if (existingSetIndex === -1) {
          // Get the matches for this new set
          const resultsForSet = assignments.get(newSetId) || [];
          const matchesForSet = resultsForSet
            .map(convertResultToMatch)
            .filter((m): m is Match => m !== null);

          console.log(`Creating new set ${newSetId} with ${matchesForSet.length} matches`);

          newSetsToAppend.push({
            setId: newSetId,
            matches: matchesForSet,
            setWinners: [],
          });

          if (newSetId > updatedHighestSetId) {
            updatedHighestSetId = newSetId;
          }
        }
      });

      // Update existing sets with their new matches
      assignments.forEach((results, setId) => {
        // Skip if this is a new set (already handled above)
        if (newSetIds.includes(setId)) return;

        const setIndex = currentSets.findIndex((s) => s.setId === setId);
        if (setIndex === -1) {
          console.warn(`Set ${setId} not found in current sets`);
          return;
        }

        const matches = results
          .map(convertResultToMatch)
          .filter((m): m is Match => m !== null);

        console.log(`Adding ${matches.length} matches to existing set ${setId} at index ${setIndex}`);

        const currentMatches = getValues(`sets.${setIndex}.matches`) || [];
        setValue(`sets.${setIndex}.matches`, [...currentMatches, ...matches], {
          shouldDirty: true,
        });
      });

      // Append all new sets at once
      if (newSetsToAppend.length > 0) {
        console.log(`Appending ${newSetsToAppend.length} new sets`);
        newSetsToAppend.forEach((newSet) => {
          append(newSet);
        });
      }

      // Update the highest set ID
      setHighestSetId(updatedHighestSetId);

      // Update openSets to show all modified sets
      const totalSets = currentSets.length + newSetsToAppend.length;
      setOpenSets((prev) => {
        const newOpenSets = Array(totalSets).fill(false);
        // Keep existing open states
        prev.forEach((isOpen, i) => {
          if (i < newOpenSets.length) newOpenSets[i] = isOpen;
        });
        // Open sets that received new matches
        assignments.forEach((_, setId) => {
          // For existing sets
          const existingIndex = currentSets.findIndex((s) => s.setId === setId);
          if (existingIndex !== -1) {
            newOpenSets[existingIndex] = true;
          }
          // For new sets
          const newSetIndex = newSetsToAppend.findIndex((s) => s.setId === setId);
          if (newSetIndex !== -1) {
            newOpenSets[currentSets.length + newSetIndex] = true;
          }
        });
        return newOpenSets;
      });

      // Clean up and close the modal
      setBulkResults([]);
      setShowReviewModal(false);
    },
    [append, convertResultToMatch, getValues, highestSetId, setValue],
  );

  useEffect(() => {
    document.documentElement.scrollTop = 0; // Scroll to top when a new set is added
  }, []);

  return (
    <div className="col-span-2 w-full space-y-4">
      {/* Loop through set fields */}
      <div className="font-2xl m-2 text-center font-bold"> Sets </div>
      {(fields.length === 0 && (
        <div className="text-muted-foreground text-center">
          No Sets! Click Add Set to start!
        </div>
      )) ||
        fields.map((set, setIndex) => {
          // Get errors for this set
          const setError = errors.sets?.[setIndex];
          return (
            <Collapsible open={openSets[setIndex]} key={set.setId}>
              <Card className="flex flex-col space-y-3 rounded-lg p-6 shadow-lg">
                <CardHeader className="flex flex-row justify-between space-y-0 pb-0 pl-0 pr-0">
                  <div className="mb-2 text-lg font-semibold">
                    Set {setIndex + 1}
                  </div>
                  <WinnerDisplay setIndex={setIndex} />
                  <div className="flex" title={`Delete Set ${setIndex + 1}`}>
                    <TrashIcon
                      className="text-sm text-red-500 hover:cursor-pointer hover:text-red-400"
                      onClick={() => remove(setIndex)}
                      width={24}
                      height={24}
                    />
                    <span className="sr-only">Delete Set {setIndex}</span>
                  </div>
                </CardHeader>
                <CollapsibleContent>
                  <FormField
                    name={`sets.${setIndex}.setWinners`}
                    control={control}
                    render={({ field }) => (
                      <FormItem>
                        <PlayerSelector
                          currentSelectedPlayers={field.value}
                          rdcMembers={players}
                          control={control}
                          field={field}
                          label="Set Winners"
                          sticky={true}
                        />
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <MatchManager setIndex={setIndex} />
                </CollapsibleContent>
                {/* TODO Surface Set Level Error Messages Here */}
                {setError && setError.matches && (
                  <div className="text-destructive text-sm">
                    {setError.matches.root?.message}
                  </div>
                )}
                <CardFooter className="flex flex-row-reverse pb-0">
                  <CollapsibleTrigger onClick={() => toggleSet(setIndex)}>
                    {" "}
                    <ChevronDown
                      className={`transition-transform duration-300 ${
                        openSets[setIndex] ? "rotate-180" : ""
                      }`}
                    />{" "}
                  </CollapsibleTrigger>
                </CardFooter>
              </Card>
            </Collapsible>
          );
        })}
      <div className="flex justify-between">
        <BulkUploadModal
          onBulkProcessingComplete={handleBulkProcessingComplete}
          sessionPlayers={players}
          gameName={gameName}
        />
        <Button
          type="button"
          onClick={() => handleAddSet()}
          className="rounded-md bg-purple-900 p-2 py-2 text-center font-semibold text-white hover:bg-purple-800"
        >
          Add Set
        </Button>
      </div>

      {/* Bulk Review Modal */}
      <BulkReviewModal
        open={showReviewModal}
        onClose={() => {
          setShowReviewModal(false);
          setBulkResults([]);
        }}
        results={bulkResults}
        existingSets={fields}
        onConfirm={handleBulkReviewConfirm}
        highestSetId={highestSetId}
      />
    </div>
  );
};

export default SetManager;
