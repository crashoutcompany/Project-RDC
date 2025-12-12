import { Player } from "@/generated/prisma/client";
import React from "react";
import { useFieldArray } from "react-hook-form";
import { useFormContext } from "react-hook-form";
import PlayerSessionManager from "./PlayerSessionManager";
import PlayerSelector from "./PlayerSelector";
import { Button } from "@/components/ui/button";
import { MinusCircledIcon } from "@radix-ui/react-icons";
import { Label } from "@/components/ui/label";
import RDCVisionModal from "./RDCVisionModal";
import { FormValues } from "../../_utils/form-helpers";
import { FormField, FormItem, FormMessage } from "@/components/ui/form";
import { Stat, VisionPlayer } from "@/lib/visionTypes";

interface Props {
  setIndex: number;
}

const MatchManager = (props: Props) => {
  const {
    control,
    getValues,
    formState: { errors },
  } = useFormContext<FormValues>();
  const { setIndex } = props;
  const { append, remove, fields } = useFieldArray({
    name: `sets.${setIndex}.matches`,
    control,
  });
  const players = getValues(`players`);
  const gameName = getValues(`game`);

  /**
   * Handles the creation of a new match by creating player sessions from the available players.
   * Maps each player to a new player session object containing their ID, name, and empty stats array.
   * Appends the new match data with empty winners array and created player sessions to the form.
   *
   * @returns {void}
   *
   */
  const handleNewMatchClick = () => {
    console.log("Handling New Match click", players);
    // Explicitly type the playerSessions constant.
    const playerSessions = players.map((player: Player) => ({
      playerId: player.playerId,
      playerSessionName: player.playerName,
      playerStats: [],
    }));
    console.log("Player Sessions: ", playerSessions);
    append({
      matchWinners: [],
      playerSessions: playerSessions,
    });
  };

  const processTeamPlayers = (teamPlayers: VisionPlayer[]) => {
    console.log("Processing Team Players: ", teamPlayers);

    return teamPlayers.map((player) => {
      // Map over the stats from the vision player to format them for the form
      const formattedStats = player.stats.map((stat: Stat) => ({
        statId: stat.statId,
        stat: stat.stat,
        statValue: stat.statValue,
      })) as FormValues["sets"][number]["matches"][number]["playerSessions"][number]["playerStats"];

      return {
        playerId: player?.playerId || 0,
        playerSessionName: player?.name || "Unknown Player",
        playerStats: formattedStats,
      };
    });
  };

  const handleCreateMatchFromVision2 = (
    visionPlayers: VisionPlayer[],
    visionWinners: VisionPlayer[],
  ) => {
    const visionMatchPlayerSessions = processTeamPlayers(visionPlayers);
    console.log("Vision Match Player Sessions: ", visionMatchPlayerSessions);

    const formattedWinners = visionWinners.map((player: VisionPlayer) => {
      return {
        playerId: player?.playerId || 0,
        playerName: player?.name,
      };
    });

    if (formattedWinners && formattedWinners.length > 0) {
      console.log("Setting Vision Winners!", formattedWinners);
      append({
        matchWinners: formattedWinners,
        playerSessions: visionMatchPlayerSessions,
      });
    } else {
      append({
        matchWinners: [],
        playerSessions: visionMatchPlayerSessions,
      });
    }
  };

  return (
    <div>
      {(fields.length === 0 && (
        <div className="my-2 text-center text-gray-500">
          No Matches! Click Add Match to start!
        </div>
      )) ||
        fields.map((match, matchIndex) => {
          const matchError =
            errors.sets?.[setIndex]?.matches?.[matchIndex]?.message;
          return (
            <div key={match.id} className="my-5 flex flex-col justify-between">
              <div id="match-manager-header" className="flex justify-between">
                <Label>Match {matchIndex + 1}</Label>
                <Button
                  className="bg-red-500 text-xs text-white hover:bg-red-400"
                  type="button"
                  onClick={() => remove(matchIndex)}
                >
                  <MinusCircledIcon /> Remove Match
                </Button>
              </div>
              <FormField
                name={`sets.${setIndex}.matches.${matchIndex}.matchWinners`}
                control={control}
                render={({ field }) => (
                  <FormItem>
                    <PlayerSelector
                      rdcMembers={players}
                      control={control}
                      field={field}
                      currentSelectedPlayers={field.value}
                      label="Match Winners"
                    />
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="my-4 text-center text-lg">
                Player Sessions for Match {matchIndex + 1}
              </div>
              <PlayerSessionManager
                setIndex={setIndex}
                matchIndex={matchIndex}
                players={players}
              />
              {matchError && (
                <div className="text-destructive text-sm">{matchError}</div>
              )}
            </div>
          );
        })}
      <div className="flex justify-between">
        <Button
          className="my-2 rounded-md bg-purple-900 p-2 font-semibold text-white hover:bg-purple-950"
          type="button"
          onClick={handleNewMatchClick}
        >
          Add Match
        </Button>
        <RDCVisionModal
          handleCreateMatchFromVision={handleCreateMatchFromVision2}
          sessionPlayers={players}
          gameName={gameName}
        />
      </div>
    </div>
  );
};

export default MatchManager;
