import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { capitalizeFirst } from "@/lib/utils";
import type { MvpProfile } from "../../_helpers/dashboard";

type PilotProfileProps = {
  mvp: MvpProfile;
  gameName: string;
};

/**
 * Displays the most recent MVP's profile card, including avatar, description,
 * and key stats. Generic to any game — labels come from the data.
 *
 * @param props - Contains mvp profile data and gameName for context.
 * @returns A card JSX element with the MVP profile or a placeholder.
 */
export function PilotProfile({ mvp, gameName }: PilotProfileProps) {
  if (!mvp) {
    return (
      <Card className="flex h-full min-h-[280px] flex-col justify-center">
        <CardContent className="text-center">
          <p className="text-muted-foreground text-sm">
            No MVP has been selected for {gameName} yet.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="flex h-full flex-col overflow-hidden">
      <CardHeader className="pb-3">
        <CardTitle className="text-muted-foreground text-xs font-medium uppercase tracking-wider">
          Player Profile
        </CardTitle>
        <div className="flex items-center gap-3">
          <Avatar className="border-primary/20 h-16 w-16 border-2">
            <AvatarImage src={mvp.image} alt={mvp.playerName} />
            <AvatarFallback>{mvp.playerName[0]}</AvatarFallback>
          </Avatar>
          <div>
            <h3 className="text-xl font-bold">{mvp.playerName.toUpperCase()}</h3>
            {mvp.description && (
              <p className="text-muted-foreground line-clamp-2 text-xs">
                {mvp.description}
              </p>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex-1 pt-0">
        {mvp.stats.length > 0 && (
          <div className="grid grid-cols-2 gap-2">
            {mvp.stats.slice(0, 4).map((stat) => (
              <div
                key={stat.statName}
                className="bg-muted rounded-md p-2"
              >
                <p className="text-muted-foreground text-xs font-medium">
                  {capitalizeFirst(stat.statName)}
                </p>
                <p className="text-lg font-bold">{stat.sum}</p>
                {stat.average !== undefined && (
                  <p className="text-muted-foreground text-xs">
                    avg: {stat.average}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
