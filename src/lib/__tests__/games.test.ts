import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { GAME_STATS } from "@/app/(routes)/admin/_utils/form-helpers";
import { STAT_BOARDS } from "@/app/(routes)/(groups)/games/[slug]/_helpers/stat-board";
import { GAME_PROCESSOR_SPECS } from "@/lib/game-processors/game-specs";
import {
  GAME_LIST,
  GAME_REGISTRY,
  gameById,
  gameByName,
  gameSlug,
} from "@/lib/games";
import { MVP_GAMES } from "@/lib/mvp/process-sets";
import { STAT_CONFIGS, recordedStatNames } from "@/lib/stat-configs";
import { GAMES as READER_SPECS } from "@/lib/vision/scoreboard-specs";

const root = path.resolve(import.meta.dirname, "../../..");

describe("game registry", () => {
  it("keys every game by the slug of its database name", () => {
    for (const game of GAME_LIST) expect(gameSlug(game.name)).toBe(game.slug);
  });

  it("gives every game its own id, name and stat prefix", () => {
    for (const key of ["gameId", "name", "statPrefix"] as const)
      expect(new Set(GAME_LIST.map((game) => game[key])).size, key).toBe(GAME_LIST.length);
  });

  it("looks games up by id and by name", () => {
    expect(gameById(2)?.name).toBe("Rocket League");
    expect(gameByName("SpeedRunners")?.slug).toBe("speedrunners");
    expect(gameById(999)).toBeUndefined();
    // The database spelling is the only one that matches.
    expect(gameByName("Speedrunners")).toBeUndefined();
  });

  it("names games exactly as the seed script creates them", () => {
    const seed = readFileSync(path.join(root, "prisma/seed.ts"), "utf8");

    for (const game of GAME_LIST) expect(seed, game.name).toContain(`gameName: "${game.name}"`);
  });

  it("points at an image that exists", () => {
    for (const game of GAME_LIST)
      expect(existsSync(path.join(root, "public/images", game.image)), game.image).toBe(true);
  });
});

describe("per-game tables agree with the registry", () => {
  it("every stat config belongs to a registered game and carries its prefix", () => {
    for (const config of Object.values(STAT_CONFIGS)) {
      const game = gameById(config.gameId);

      expect(game, config.name).toBeDefined();
      expect(config.name.startsWith(`${game!.statPrefix}_`), config.name).toBe(true);
    }
  });

  it("every game records at least one stat, and the form accepts exactly those", () => {
    for (const game of GAME_LIST) {
      const recorded = recordedStatNames(game.gameId);

      expect(recorded.length, game.name).toBeGreaterThan(0);
      expect(recorded.some((stat) => stat.endsWith("_DAY")), game.name).toBe(false);
      expect(GAME_STATS[game.name], game.name).toEqual(recorded);
    }
    expect(Object.keys(GAME_STATS)).toEqual(GAME_LIST.map((game) => game.name));
  });

  it("every stat board charts only its own game's stats", () => {
    for (const [slug, board] of Object.entries(STAT_BOARDS)) {
      const { statPrefix } = GAME_REGISTRY[slug as keyof typeof GAME_REGISTRY];
      const stats = board.charts.flatMap((chart) => ("stat" in chart ? [chart.stat] : []));

      for (const stat of [...stats, ...board.playedWhen])
        expect(stat.startsWith(`${statPrefix}_`), `${slug}: ${stat}`).toBe(true);
    }
  });

  it("processor specs take their identity and layout from the registry", () => {
    for (const spec of GAME_PROCESSOR_SPECS) {
      const game = gameById(spec.gameId)!;

      expect(spec.name).toBe(game.name);
      expect(spec.input.layout).toBe(game.teams ? "teams" : "solo");
      expect(spec.winner.stat.startsWith(`${game.statPrefix}_`), spec.name).toBe(true);
      if (spec.input.layout === "teams") expect(spec.input.teams.length, spec.name).toBeGreaterThan(0);
    }
  });

  it("a reader spec only exists for a game with a processor, and maps onto its team fields", () => {
    for (const reader of Object.values(READER_SPECS)) {
      const processor = GAME_PROCESSOR_SPECS.find((spec) => spec.gameId === reader.gameId);

      expect(processor, reader.id).toBeDefined();
      expect(reader.displayName).toBe(processor!.name);
      expect(reader.teams).toBe(processor!.input.layout === "teams");
      if (processor!.input.layout === "teams")
        expect(Object.values(reader.teamFields ?? {}).sort()).toEqual([...processor!.input.teams].sort());
    }
  });

  it("only generates MVPs for registered games", () => {
    for (const name of MVP_GAMES) expect(gameByName(name), name).toBeDefined();
  });
});
