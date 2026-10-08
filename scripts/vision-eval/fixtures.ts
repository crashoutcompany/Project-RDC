import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Player } from "@/generated/prisma/client";
import type { FixtureExpectation } from "./metrics";

export interface Fixture {
  id: string;
  imageBase64: string;
  gameId: number;
  sessionPlayers: Player[];
  expected: FixtureExpectation;
}

interface ExpectedJson {
  /** Set by `pnpm harvest --emit-fixtures`; delete once every value is hand-checked. */
  _draft?: boolean;
  gameId: number;
  sessionPlayers: string[];
  players: { name: string; stats: Record<string, string> }[];
  winners?: string[];
}

const IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg"];

const findImageFile = (caseDir: string): string | undefined =>
  IMAGE_EXTENSIONS.map((ext) => join(caseDir, `image${ext}`)).find((path) =>
    existsSync(path),
  );

/**
 * Loads `<fixturesDir>/<caseId>/{image.png,expected.json}` fixtures. See
 * `scripts/vision-eval/README.md` for the expected.json shape.
 */
export const loadFixtures = (fixturesDir: string): Fixture[] => {
  if (!existsSync(fixturesDir)) return [];

  return readdirSync(fixturesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry): Fixture | undefined => {
      const caseDir = join(fixturesDir, entry.name);
      const expectedPath = join(caseDir, "expected.json");
      const imageFile = findImageFile(caseDir);

      if (!existsSync(expectedPath) || !imageFile) {
        console.warn(
          `Skipping ${entry.name}: needs both expected.json and image.{png,jpg,jpeg}`,
        );
        return undefined;
      }

      const expectedJson = JSON.parse(
        readFileSync(expectedPath, "utf-8"),
      ) as ExpectedJson;

      if (expectedJson._draft)
        console.warn(
          `${entry.name}: expected.json is still an unreviewed harvester draft — ` +
            `check every value, then delete "_draft", or its scores are meaningless`,
        );

      const sessionPlayers = expectedJson.sessionPlayers.map(
        (playerName, index) =>
          ({ playerId: index + 1, playerName }) as Player,
      );

      return {
        id: entry.name,
        imageBase64: readFileSync(imageFile).toString("base64"),
        gameId: expectedJson.gameId,
        sessionPlayers,
        expected: {
          gameId: expectedJson.gameId,
          sessionPlayers: expectedJson.sessionPlayers,
          players: expectedJson.players,
          winners: expectedJson.winners ?? [],
        },
      };
    })
    .filter((fixture): fixture is Fixture => fixture !== undefined)
    .sort((a, b) => a.id.localeCompare(b.id));
};
