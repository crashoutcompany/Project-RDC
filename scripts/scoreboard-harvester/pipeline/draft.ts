import fs from "fs";
import path from "path";
import type { Player } from "@/generated/prisma/client";
import { PLAYER_MAPPINGS } from "@/app/(routes)/admin/_utils/player-mappings";
import { runVisionCase, type CaseResult } from "../../vision-eval/run-case";
import type { MatchDraft, MatchManifest } from "../types";

/**
 * Runs the app's real extraction pipeline (provider -> bridge -> processor ->
 * validation, via the eval's `runVisionCase`) on each harvested match and
 * records the result as a draft.
 *
 * This module transitively imports `@/lib/constants` -> prisma typed SQL, so
 * index.ts loads it with `await import()` only when --draft is set; plain
 * detection runs don't need a generated Prisma client.
 *
 * @param args.matches - Saved matches from dedupAndSave.
 * @param args.workDir - Run directory holding the match PNGs.
 * @param args.appGameId - `GAME_CONFIGS` id for the game.
 * @param args.modelSpec - `<providerId>:<modelId>` extraction model.
 * @param args.players - Session roster; empty means every known RDC member.
 * @param args.emitFixtures - Optional vision-eval fixtures dir to also write into.
 * @param args.source - Video id + source for fixture provenance.
 * @returns The matches with `draft` populated.
 */
export async function draftMatches(args: {
  matches: MatchManifest[];
  workDir: string;
  appGameId: number;
  modelSpec: string;
  players: string[];
  emitFixtures?: string;
  source: { videoId: string; url?: string; filePath: string };
}): Promise<MatchManifest[]> {
  const { matches, workDir, appGameId, modelSpec, emitFixtures, source } = args;

  // runVisionCase picks its provider from env, same as the app.
  process.env.VISION_PROVIDER = "llm";
  process.env.VISION_MODEL = modelSpec;

  const roster = args.players.length > 0 ? args.players : Object.keys(PLAYER_MAPPINGS);
  const sessionPlayers = roster.map(
    (playerName, index) => ({ playerId: index + 1, playerName }) as Player,
  );
  console.log(
    `[draft] extracting ${matches.length} match(es) with ${modelSpec}, roster=${roster.join(",")}`,
  );

  const drafted: MatchManifest[] = [];
  for (const match of matches) {
    const imagePath = path.join(workDir, match.imagePath);
    const result = await runVisionCase(
      fs.readFileSync(imagePath).toString("base64"),
      appGameId,
      sessionPlayers,
    );

    const draftPath = match.imagePath.replace(/\.png$/, ".json");
    const draft: MatchDraft = {
      model: modelSpec,
      status: result.status,
      message: result.message,
      draftPath,
      players: result.players,
      winners: result.winners,
    };
    fs.writeFileSync(
      path.join(workDir, draftPath),
      JSON.stringify(draft, null, 2),
    );
    console.log(
      `[draft] match ${match.match}: ${result.status}` +
        (result.message ? ` (${result.message})` : "") +
        (result.players ? ` players=${result.players.length}` : ""),
    );

    if (emitFixtures && result.players)
      writeFixture({
        dir: path.join(
          emitFixtures,
          `${source.videoId}-match-${String(match.match).padStart(2, "0")}`,
        ),
        imagePath,
        appGameId,
        result,
        provenance: {
          video: source.url ?? source.filePath,
          timestamp: match.timestampStr,
          model: modelSpec,
        },
      });

    drafted.push({ ...match, draft });
  }
  return drafted;
}

/**
 * Converts a processed result into the vision-eval `expected.json` shape.
 * `sessionPlayers` is the matched players, since a fixture's roster must be
 * exactly the players on the screenshot. `_draft` stays until a human has
 * checked every value; loadFixtures warns while it's present.
 */
export function toDraftExpected(
  appGameId: number,
  result: CaseResult,
  provenance: Record<string, string>,
) {
  const players = (result.players ?? []).map((player) => ({
    name: player.name,
    stats: Object.fromEntries(
      player.stats.map((stat) => [stat.stat, stat.statValue]),
    ),
  }));
  return {
    _draft: true,
    _source: provenance,
    gameId: appGameId,
    sessionPlayers: players.map((p) => p.name),
    players,
    winners: result.winners ?? [],
  };
}

function writeFixture(args: {
  dir: string;
  imagePath: string;
  appGameId: number;
  result: CaseResult;
  provenance: Record<string, string>;
}): void {
  const { dir, imagePath, appGameId, result, provenance } = args;
  const expectedPath = path.join(dir, "expected.json");
  // Never clobber a fixture someone may already have corrected by hand.
  if (fs.existsSync(expectedPath)) {
    console.log(`[draft] fixture exists, leaving it alone: ${dir}`);
    return;
  }
  fs.mkdirSync(dir, { recursive: true });
  fs.copyFileSync(imagePath, path.join(dir, "image.png"));
  fs.writeFileSync(
    expectedPath,
    JSON.stringify(toDraftExpected(appGameId, result, provenance), null, 2) + "\n",
  );
  console.log(`[draft] fixture → ${dir}`);
}
