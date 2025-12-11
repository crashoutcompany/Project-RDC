import { Player } from "prisma/generated";
import { useEffect } from "react";
import { FieldValues, useFieldArray, useFormContext } from "react-hook-form";
import PlayerStatManager from "./PlayerStatManager";
import { Label } from "@/components/ui/label";

interface Props {
  setIndex: number;
  matchIndex: number;
  players: Player[];
}

const PlayerSessionManager = (props: Props) => {
  const { setIndex, matchIndex, players } = props;
  const { control, getValues } = useFormContext<FieldValues>();
  const { append, remove, fields } = useFieldArray<FieldValues>({
    name: `sets.${setIndex}.matches.${matchIndex}.playerSessions`,
    control,
  });

  useEffect(() => {
    const finalPlayerSessionValues = getValues(
      `sets.${setIndex}.matches.${matchIndex}.playerSessions`,
    );

    // Add new PlayerSession for each Player
    players.forEach((player) => {
      const playerExists = finalPlayerSessionValues.some(
         
        (playerSession: any) => player.playerId === playerSession.playerId,
      );
      if (!playerExists) {
        append({
          playerId: player.playerId,
          playerSessionName: player.playerName,
          playerStats: [],
        });
      }
    });

    // Remove player sessions for players that are no longer in the players array
     
    finalPlayerSessionValues.forEach((playerSession: any, index: number) => {
      const playerExists = players.some(
        (player) => player.playerId === playerSession.playerId,
      );
      if (!playerExists) {
        remove(index);
      }
    });
  }, [props.players, append, getValues, setIndex, matchIndex, players, remove]);

   
  const getPlayerNameFromField = (field: any): boolean => {
    return field?.playerSessionName ?? 0; // Discrepancy in what is being assigned to playerSessionName
  };

  console.log("PlayerSessionManager Fields: ", fields);

  // TODO Continue working on responsive design
  return (
    <div className="@container grid grid-cols-2">
      {fields.map((field, sessionIndex) => {
        return (
          <div className="@xs:col-span-1 col-span-2" key={field.id}>
            <Label className="font-bold">{getPlayerNameFromField(field)}</Label>
            <div className="flex flex-wrap gap-3">
              <PlayerStatManager
                {...props}
                playerSessionIndex={sessionIndex}
                player={players[sessionIndex]}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default PlayerSessionManager;
