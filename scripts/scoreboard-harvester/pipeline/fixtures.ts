import fs from "fs";
import path from "path";
import { VisionResultCodes } from "@/lib/constants";
import type { VisionPlayer } from "@/lib/visionTypes";
import type { Manifest } from "../types";

/**
 * Turns a read scoreboard into the vision-eval `expected.json` shape.
 * `sessionPlayers` is the matched players, since a fixture's roster must be
 * exactly the players on the screenshot. `_draft` stays until a human has
 * checked every value; loadFixtures warns while it's present.
 */
export function toDraftExpected(
  gameId: number,
  players: VisionPlayer[],
  winners: VisionPlayer[],
  provenance: Record<string, string>,
) {
  const expectedPlayers = players.map((player) => ({
    name: player.name,
    stats: Object.fromEntries(
      player.stats.map((stat) => [stat.stat, stat.statValue]),
    ),
  }));
  return {
    _draft: true,
    _source: provenance,
    gameId,
    sessionPlayers: expectedPlayers.map((p) => p.name),
    players: expectedPlayers,
    winners: winners.map((w) => w.name),
  };
}

/**
 * `--emit-fixtures`: turns "build 20 eval fixtures" into "correct 20 drafts".
 * Writes one vision-eval fixture (image + draft expected.json) per match the
 * reader read, from the analysis the harvest already produced. Never clobbers
 * a fixture someone may already have corrected by hand.
 */
export function emitFixtures(args: {
  manifest: Manifest;
  workDir: string;
  videoId: string;
  gameId: number;
  /** vision-eval fixtures directory. */
  dir: string;
}): void {
  const { manifest, workDir, videoId, gameId, dir } = args;
  let written = 0;
  for (const match of manifest.matches) {
    const analysis = match.analysis;
    if (!analysis || analysis.status === VisionResultCodes.Failed) continue;

    const fixtureDir = path.join(
      dir,
      `${videoId}-match-${String(match.match).padStart(2, "0")}`,
    );
    const expectedPath = path.join(fixtureDir, "expected.json");
    if (fs.existsSync(expectedPath)) {
      console.log(`[fixtures] exists, leaving it alone: ${fixtureDir}`);
      continue;
    }
    fs.mkdirSync(fixtureDir, { recursive: true });
    fs.copyFileSync(
      path.join(workDir, match.imagePath),
      path.join(fixtureDir, "image.png"),
    );
    fs.writeFileSync(
      expectedPath,
      JSON.stringify(
        toDraftExpected(gameId, analysis.data.players, analysis.data.winner ?? [], {
          video: manifest.source.url ?? manifest.source.filePath,
          timestamp: match.timestampStr,
          reader: match.reader?.id ?? "unknown",
        }),
        null,
        2,
      ) + "\n",
    );
    console.log(`[fixtures] ${fixtureDir}`);
    written++;
  }
  console.log(`[fixtures] wrote ${written} fixture(s) to ${dir}`);
}
