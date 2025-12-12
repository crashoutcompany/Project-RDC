import { useEffect, useState } from "react";
import { Player } from "@/generated/prisma/client";
import { useFormContext, useFieldArray } from "react-hook-form";
import { v4 as uuidv4 } from "uuid";
import { Input } from "@/components/ui/input";
import { useAdmin } from "@/lib/adminContext";
import { FormValues } from "../../_utils/form-helpers";
import { FormField, FormItem, FormMessage } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import {
  ChevronDown,
  ChevronUp,
  Swords,
  Shield,
  Plus,
  HandMetal,
  Flame,
} from "lucide-react";
import { StatName } from "@/lib/stat-names";
import { cn } from "@/lib/utils";

interface Props {
  player: Player;
  matchIndex: number;
  setIndex: number;
  playerSessionIndex: number;
}

// Stats that should be shown in the expandable card for Marvel Rivals
const MARVEL_RIVALS_EXPANDABLE_STATS: StatName[] = [
  StatName.MR_TRIPLE_KILL,
  StatName.MR_QUADRA_KILL,
  StatName.MR_PENTA_KILL,
  StatName.MR_HEXA_KILL,
  StatName.MR_MOST_KILLS,
  StatName.MR_HIGHEST_DMG,
  StatName.MR_HIGHEST_DMG_BLOCKED,
  StatName.MR_MOST_HEALING,
  StatName.MR_MOST_ASSISTS,
];

const PlayerStatManager = (props: Props) => {
  const { matchIndex, setIndex, playerSessionIndex } = props;
  const curPlayerSession =
    `sets.${setIndex}.matches.${matchIndex}.playerSessions.${playerSessionIndex}` as const;
  const { register, control, getValues } = useFormContext<FormValues>();
  const { append, fields } = useFieldArray({
    name: `${curPlayerSession}.playerStats`,
    control,
  });

  const { gameStats } = useAdmin();
  const [isExtraStatExpanded, setIsExtraStatExpanded] = useState(false);

  // Get the current game
  const currentGame = getValues("game");
  const isMarvelRivals = currentGame === "Marvel Rivals";

  console.log("game stats: ", gameStats);

  // TODO: Move to PlayerSessionManager or above
  // TODO: Error message doesn't show up for RL bc refine doesn't pass.

  useEffect(() => {
    let ignore = false;
    const matchFields = getValues(`${curPlayerSession}.playerStats`);
    gameStats.forEach((stat, index) => {
      const isMatch = matchFields.some((f) => f.stat === stat.statName); // Need to do this in dev because useEffect renders twice.
      const isToggleStat =
        isMarvelRivals &&
        (MARVEL_RIVALS_EXPANDABLE_STATS as readonly StatName[]).includes(
          stat.statName as StatName,
        );
      if (!ignore && !isMatch)
        append({
          statId: stat.statId,
          stat: stat.statName as any, // Runtime: gameStats filtered by game. Validation: Zod schema ensures correct type
          statValue: isToggleStat ? "0" : "",
        });
    });

    return () => {
      ignore = true;
    };
  }, [gameStats, append, curPlayerSession, getValues]);

  // Separate fields into regular and expandable for Marvel Rivals
  const regularFields = isMarvelRivals
    ? fields.filter(
        (field) =>
          !(MARVEL_RIVALS_EXPANDABLE_STATS as readonly StatName[]).includes(
            field.stat as StatName,
          ),
      )
    : fields;

  const expandableFields = isMarvelRivals
    ? fields.filter((field) =>
        (MARVEL_RIVALS_EXPANDABLE_STATS as readonly StatName[]).includes(
          field.stat as StatName,
        ),
      )
    : [];

  const renderStatField = (field: (typeof fields)[number], index: number) => {
    const curr = `${curPlayerSession}.playerStats.${index}.statValue` as const;
    return (
      <div key={field.id} className="my-4">
        <div className="relative">
          <FormField
            control={control}
            name={curr}
            render={() => (
              <FormItem>
                <Input
                  className="peer block w-[100px] appearance-none rounded-t-lg border-2 px-2.5 pt-6 pb-2.5 text-sm focus:border-b-gray-200 focus:ring-0 focus:outline-none dark:focus:border-purple-700"
                  id={curr}
                  type="text"
                  {...register(curr)}
                />

                <label
                  htmlFor={curr}
                  className="dark:text-white-500 absolute start-2.5 top-4 z-10 origin-[0] -translate-y-4 scale-75 transform pb-1 text-sm duration-300 peer-placeholder-shown:translate-y-0 peer-placeholder-shown:scale-100 peer-focus:-translate-y-4 peer-focus:scale-75 peer-focus:text-purple-500 rtl:peer-focus:left-auto rtl:peer-focus:translate-x-1/4 peer-focus:dark:text-purple-700"
                >
                  {field.stat}
                </label>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
      </div>
    );
  };

  const renderToggleField = (field: (typeof fields)[number], index: number) => {
    const curr = `${curPlayerSession}.playerStats.${index}.statValue` as const;

    // Function to get icon for each stat
    const getStatIcon = (statName: string) => {
      switch (statName) {
        case StatName.MR_TRIPLE_KILL:
          return <span className="font-bold">3</span>;
        case StatName.MR_QUADRA_KILL:
          return <span className="font-bold">4</span>;
        case StatName.MR_PENTA_KILL:
          return <span className="font-bold">5</span>;
        case StatName.MR_HEXA_KILL:
          return <span className="font-bold">6</span>;
        case StatName.MR_HIGHEST_DMG:
          return <Flame className="h-4 w-4" />;
        case StatName.MR_HIGHEST_DMG_BLOCKED:
          return <Shield className="h-4 w-4" />;
        case StatName.MR_MOST_HEALING:
          return <Plus className="h-4 w-4" />;
        case StatName.MR_MOST_ASSISTS:
          return <HandMetal className="h-4 w-4" />;
        case StatName.MR_MOST_KILLS:
          return <Swords className="h-4 w-4" />;
        default:
          return null;
      }
    };

    return (
      <FormField
        key={field.id}
        control={control}
        name={curr}
        render={({ field: formField }) => (
          <FormItem>
            <Button
              type="button"
              variant={
                formField.value === "1" || formField.value === "true"
                  ? "default"
                  : "outline"
              }
              size="sm"
              onClick={() => {
                const isActive =
                  formField.value === "1" || formField.value === "true";
                formField.onChange(isActive ? "0" : "1");
              }}
              className={cn(
                "flex items-center justify-start gap-2",
                formField.value === "1" ||
                  (formField.value === "true" &&
                    "bg-primary text-primary-foreground"),
              )}
            >
              {getStatIcon(field.stat)}
              <span className="text-[8px]">
                {field.stat.replace("MR_", "").replace(/_/g, " ")}
              </span>
            </Button>
          </FormItem>
        )}
      />
    );
  };

  return (
    <>
      {regularFields.map((field) => {
        const actualIndex = fields.findIndex((f) => f.id === field.id);
        return renderStatField(field, actualIndex);
      })}

      {isMarvelRivals && expandableFields.length > 0 && (
        <div className="my-4 w-full">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setIsExtraStatExpanded(!isExtraStatExpanded)}
            className="flex items-center gap-2"
          >
            {isExtraStatExpanded ? (
              <ChevronUp size={16} />
            ) : (
              <ChevronDown size={16} />
            )}
            Multi-Kills & Medals
          </Button>

          {isExtraStatExpanded && (
            <div className="mt-2 grid grid-cols-3 gap-2 rounded-lg border p-3">
              {expandableFields.map((field) => {
                const actualIndex = fields.findIndex((f) => f.id === field.id);
                return renderToggleField(field, actualIndex);
              })}
            </div>
          )}
        </div>
      )}
    </>
  );
};

export default PlayerStatManager;
