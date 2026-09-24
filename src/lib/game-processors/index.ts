import { GameProcessor } from "./game-processor-utils";
import { MarioKart8Processor } from "./MarioKart8Processor";
import { RocketLeagueProcessor } from "./RocketLeagueProcessor";
import { CoDGunGameProcessor } from "./CoDGunGameProcessor";
import { MarvelRivalsProcessor } from "./MarvelRivalsProcessor";

// Lives here rather than in visionAction.ts so CLI scripts (vision-eval, the
// scoreboard harvester's --draft) can use it without importing server
// analytics -> Better Auth, which throws at load without BETTER_AUTH_SECRET.
export const getGameProcessor = (gameId: number): GameProcessor => {
  switch (gameId) {
    case 1:
      return MarioKart8Processor;
    case 2:
      return RocketLeagueProcessor;
    case 3:
      return CoDGunGameProcessor;
    case 6:
      return MarvelRivalsProcessor;
    default:
      throw new Error(`Invalid game id: ${gameId}`);
  }
};
