"use client";
import { Player } from "@/generated/prisma/client";
import React, { useEffect, useState } from "react";
import PlayerAvatar from "./PlayerAvatar";
import { ControllerRenderProps, UseFormReturn } from "react-hook-form";
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";
import { FormValues } from "../../_utils/form-helpers";
interface Props {
  rdcMembers: Player[];
  handlePlayerClick?: (player: Player) => void;
  control?: UseFormReturn<FormValues>["control"];
  sticky?: boolean;
  fieldName?: string;
  field: ControllerRenderProps<FormValues>;
  currentSelectedPlayers?: Player[];
  label: string;
}
const PlayerSelector = ({
  handlePlayerClick,
  rdcMembers,
  field,
  currentSelectedPlayers,
  sticky = false,
  label,
}: Props) => {
  const selectedPlayers =
    (field.value as Player[]) ?? currentSelectedPlayers ?? [];

  const reactHookFormHandlePlayerClick = (player: Player): void => {
    const isSelected = getIsSelected(player);

    const updatedPlayers = isSelected
      ? selectedPlayers.filter((p) => p.playerId !== player.playerId)
      : [...selectedPlayers, player];

    field.onChange(updatedPlayers);
  };

  const getIsSelected = (player: Player): boolean => {
    return selectedPlayers.some(
      (selectedPlayer) => selectedPlayer.playerId === player.playerId,
    );
  };
  const getPlayerAvatarClassName = (player: Player): string => {
    const isSelected = getIsSelected(player);
    return isSelected ? "border-2 border-purple-700" : "";
  };

  return (
    <>
      <div
        style={sticky ? { position: "-webkit-sticky" } : undefined}
        className={cn(
          "w-fit rounded-md border p-4",
          sticky && "bg-card sticky top-12 z-20",
        )}
        id="player-selector-container"
      >
        <Label className="text-muted-foreground mb-6 block">{label}</Label>
        {rdcMembers?.length !== 0 ? (
          <div className="mt-2 flex flex-wrap gap-y-4 md:grid md:grid-cols-8">
            {rdcMembers.map((player, index) => (
              <div key={player.playerId} className="relative">
                <div
                  className={cn(
                    "absolute -top-2 right-1/2 left-1/2 h-2 w-2 rounded-full bg-gray-500 transition-colors",
                    getIsSelected(player) && "bg-green-500",
                  )}
                ></div>
                <PlayerAvatar
                  key={index}
                  player={player}
                  handleOnClick={
                    handlePlayerClick
                      ? () => handlePlayerClick(player)
                      : () => reactHookFormHandlePlayerClick(player)
                  }
                  optionalClassName={`m-1 flex h-10 w-10 cursor-pointer items-center justify-center rounded-full ${getPlayerAvatarClassName(
                    player,
                  )}`}
                />
              </div>
            ))}
          </div>
        ) : (
          <div className="text-md">No Players in this context!</div>
        )}
      </div>
    </>
  );
};

export default PlayerSelector;
