"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  resolveVisionFlag,
  type FlagResolution,
} from "@/app/actions/visionFlags";

type PlayerOption = { playerId: number; playerName: string };

/** Confirm, correct or reject one flagged field. */
export function FlagReviewActions({
  flagId,
  isPlayerName,
  readValue,
  currentPlayerId,
  players,
}: {
  flagId: number;
  isPlayerName: boolean;
  readValue: string;
  currentPlayerId: number;
  players: PlayerOption[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [correcting, setCorrecting] = useState(false);
  const [value, setValue] = useState(isPlayerName ? "" : readValue);

  const resolve = (resolution: FlagResolution, success: string) =>
    startTransition(async () => {
      const { error } = await resolveVisionFlag(flagId, resolution);
      if (error) {
        toast.error(error);
        return;
      }
      toast.success(success);
      router.refresh();
    });

  if (correcting)
    return (
      <form
        className="flex items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          resolve({ action: "correct", value }, "Correction saved");
        }}
      >
        {isPlayerName ? (
          <Select value={value} onValueChange={setValue}>
            <SelectTrigger className="w-40" aria-label="Correct player">
              <SelectValue placeholder="Pick player" />
            </SelectTrigger>
            <SelectContent>
              {players
                .filter((player) => player.playerId !== currentPlayerId)
                .map((player) => (
                  <SelectItem
                    key={player.playerId}
                    value={String(player.playerId)}
                  >
                    {player.playerName}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        ) : (
          <Input
            aria-label="Correct value"
            className="w-24"
            inputMode="numeric"
            value={value}
            onChange={(event) => setValue(event.target.value)}
          />
        )}
        <Button size="sm" type="submit" disabled={isPending || !value}>
          Save
        </Button>
        <Button
          size="sm"
          type="button"
          variant="ghost"
          disabled={isPending}
          onClick={() => setCorrecting(false)}
        >
          Cancel
        </Button>
      </form>
    );

  return (
    <div className="flex flex-wrap gap-2">
      <Button
        size="sm"
        disabled={isPending}
        onClick={() => resolve({ action: "confirm" }, "Marked as correct")}
      >
        Confirm
      </Button>
      <Button
        size="sm"
        variant="outline"
        disabled={isPending}
        onClick={() => setCorrecting(true)}
      >
        Correct
      </Button>
      <Button
        size="sm"
        variant="destructive"
        disabled={isPending}
        title="Marks the read as wrong. Fix the session from Edit."
        onClick={() =>
          resolve(
            { action: "reject" },
            "Marked as wrong. Fix it from the session's Edit page.",
          )
        }
      >
        Reject
      </Button>
    </div>
  );
}
