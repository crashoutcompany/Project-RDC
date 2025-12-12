"use client";

import React from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Player } from "@/generated/prisma/client";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { findPlayer } from "@/app/(routes)/admin/_utils/player-mappings";

interface PlayerAvatarProps {
  player: Player;
  optionalClassName?: string;
  handleOnClick?: () => void;
}

const PlayerAvatar = ({
  player,
  handleOnClick,
  optionalClassName,
}: PlayerAvatarProps) => {
  const avatarSrc = findPlayer(player.playerName)?.image || "";

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Avatar
            className={
              optionalClassName
                ? optionalClassName
                : `m-1 flex h-10 w-10 cursor-pointer items-center justify-center rounded-full bg-slate-300`
            }
            onClick={handleOnClick}
          >
            <AvatarFallback className="AvatarFallback">
              {player.playerName.slice(0, 2)}
            </AvatarFallback>
            <AvatarImage src={avatarSrc} alt={player.playerName} />
          </Avatar>
        </TooltipTrigger>
        <TooltipContent className="dark:bg-purple-700 dark:text-white">
          <p>{player.playerName}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

export default PlayerAvatar;
