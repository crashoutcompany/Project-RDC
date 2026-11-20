/** A game's URL segment: its database name, lowercased with no spaces. */
export enum GamesEnum {
  RocketLeague = "rocketleague",
  LethalCompany = "lethalcompany",
  CallOfDuty = "callofduty",
  MarioKart8 = "mariokart8",
  SpeedRunners = "speedrunners",
  MarvelRivals = "marvelrivals",
}

type GameDefinition = {
  /** games.game_name, exactly as seeded. Forms and lookups use this spelling. */
  name: string;
  /** games.game_id in the seeded database. */
  gameId: number;
  /** What every one of the game's stat names starts with ("RL" in RL_GOALS). */
  statPrefix: string;
  /** Scoreboards list players per team rather than in one table. */
  teams: boolean;
  /** File under public/images. */
  image: string;
  /** The custom Azure Document Intelligence model trained on its scoreboard. */
  azureModelId: string;
};

/**
 * The games this app tracks, in display order. This is the one list of games:
 * every per-game table (stat configs, stat boards, form rules, vision specs,
 * colors) is keyed by an entry here, so adding a game starts with a line in
 * this object and the type checker points at the tables that need one too.
 */
export const GAME_REGISTRY = {
  [GamesEnum.MarioKart8]: {
    name: "Mario Kart 8",
    gameId: 1,
    statPrefix: "MK8",
    teams: false,
    image: "mk8.jpg",
    azureModelId: "RDC-MK8",
  },
  [GamesEnum.RocketLeague]: {
    name: "Rocket League",
    gameId: 2,
    statPrefix: "RL",
    teams: true,
    image: "rocketleague.png",
    azureModelId: "RDC-RL",
  },
  [GamesEnum.CallOfDuty]: {
    name: "Call of Duty",
    gameId: 3,
    statPrefix: "COD",
    teams: false,
    image: "callofduty.jpeg",
    azureModelId: "RDC-COD",
  },
  [GamesEnum.LethalCompany]: {
    name: "Lethal Company",
    gameId: 4,
    statPrefix: "LC",
    teams: true,
    image: "lethalcompany.jpg",
    azureModelId: "RDC-LC",
  },
  [GamesEnum.SpeedRunners]: {
    name: "SpeedRunners",
    gameId: 5,
    statPrefix: "SR",
    teams: false,
    image: "speedrunners.jpeg",
    azureModelId: "RDC-SR",
  },
  [GamesEnum.MarvelRivals]: {
    name: "Marvel Rivals",
    gameId: 6,
    statPrefix: "MR",
    teams: false,
    image: "marvel_rvials.jpg",
    azureModelId: "RDC-MR",
  },
} as const satisfies Record<GamesEnum, GameDefinition>;

export type GameName = (typeof GAME_REGISTRY)[GamesEnum]["name"];

/** A registry entry together with its slug. */
export type Game = Omit<GameDefinition, "name"> & {
  name: GameName;
  slug: GamesEnum;
};

/** Every tracked game, in display order. */
export const GAME_LIST: Game[] = Object.entries(GAME_REGISTRY).map(
  ([slug, game]) => ({ slug: slug as GamesEnum, ...game }),
);

export const GAME_NAMES = GAME_LIST.map((game) => game.name) as [
  GameName,
  ...GameName[],
];

/** "Mario Kart 8" -> "mariokart8". Also works for games not in the registry. */
export const gameSlug = (gameName: string) =>
  gameName.replace(/\s/g, "").toLowerCase();

export const gameById = (gameId: number): Game | undefined =>
  GAME_LIST.find((game) => game.gameId === gameId);

export const gameByName = (gameName: string): Game | undefined =>
  GAME_LIST.find((game) => game.name === gameName);

/** Image file per game slug, under public/images. */
export const gameImages: Record<GamesEnum, string> = Object.fromEntries(
  GAME_LIST.map((game) => [game.slug, game.image]),
) as Record<GamesEnum, string>;
