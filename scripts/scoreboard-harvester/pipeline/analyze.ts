import fs from "fs";
import path from "path";
import type { Player } from "@/generated/prisma/client";
import { VisionResultCodes } from "@/lib/constants";
import {
  analyzeScoreboard,
  createDocumentIntelligenceClient,
} from "@/lib/vision/analyze-scoreboard";
import type { MatchManifest } from "../types";

/**
 * Runs every saved scoreboard through the game's custom Azure Document
 * Intelligence model — the same code path as the admin "RDC Vision" button.
 *
 * `players` is every known RDC member: the processors map gamertags to members
 * and drop anyone they don't recognize (randoms in public lobbies), so passing
 * the full roster is how we avoid knowing who played up front.
 *
 * Results are cached as `match-NN.analysis.json` next to each PNG so reruns
 * don't pay for Azure twice.
 */
export async function analyzeMatches(args: {
  matches: MatchManifest[];
  workDir: string;
  gameId: number;
  players: Player[];
}): Promise<MatchManifest[]> {
  const { matches, workDir, gameId, players } = args;
  const endpoint = process.env.DOCUMENT_INTELLIGENCE_ENDPOINT;
  const key = process.env.DOCUMENT_INTELLIGENCE_API_KEY;
  if (!endpoint || !key)
    throw new Error(
      "DOCUMENT_INTELLIGENCE_ENDPOINT and DOCUMENT_INTELLIGENCE_API_KEY must be set to analyze scoreboards",
    );

  const client = createDocumentIntelligenceClient(endpoint, key);
  const analyzed: MatchManifest[] = [];

  for (const match of matches) {
    const cachePath = path.join(
      workDir,
      match.imagePath.replace(/\.png$/, ".analysis.json"),
    );
    if (fs.existsSync(cachePath)) {
      analyzed.push({
        ...match,
        analysis: JSON.parse(fs.readFileSync(cachePath, "utf8")),
      });
      continue;
    }

    const base64Source = fs
      .readFileSync(path.join(workDir, match.imagePath))
      .toString("base64");

    let analysis: MatchManifest["analysis"];
    try {
      analysis = await withQuietLogs(() =>
        analyzeScoreboard({
          client,
          base64Source,
          sessionPlayers: players,
          gameId,
        }),
      );
    } catch (err) {
      analysis = {
        status: VisionResultCodes.Failed,
        message: err instanceof Error ? err.message : String(err),
      };
    }

    const summary =
      analysis.status === VisionResultCodes.Failed
        ? analysis.message
        : `${analysis.data.players.length} RDC players`;
    console.log(
      `[analyze] match ${match.match}: ${analysis.status} (${summary})`,
    );

    // Only cache real answers; transient failures should retry next run.
    if (analysis.status !== VisionResultCodes.Failed)
      fs.writeFileSync(cachePath, JSON.stringify(analysis, null, 2));
    analyzed.push({ ...match, analysis });
  }

  return analyzed;
}

/**
 * The game processors log every field they touch and console.error every
 * gamertag they can't map (expected for randoms in public lobbies). That
 * buries the harvester's progress output, so mute the console while one
 * screenshot is processed. Set HARVEST_VERBOSE=1 to see it all.
 */
async function withQuietLogs<T>(fn: () => Promise<T>): Promise<T> {
  if (process.env.HARVEST_VERBOSE) return fn();
  const { log, warn, error } = console;
  console.log = console.warn = console.error = () => {};
  try {
    return await fn();
  } finally {
    Object.assign(console, { log, warn, error });
  }
}
