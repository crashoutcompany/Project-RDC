import { google } from "googleapis";
import { extractYoutubeId } from "../utils";
import type { GameProfile } from "../games/types";

export interface CandidateVideo {
  videoId: string;
  title: string;
  /** Sheet date string, used only for ordering and the report. */
  date: string;
  profile: GameProfile;
}

export interface SheetRow {
  title: string;
  videoId: string;
  date: string;
  addedToDb: boolean;
  games: string;
}

/**
 * Reads the "Truth" sheet that the RDC Live scraper fills — the same sheet
 * and service account the /api/sheets cron route uses (SHEET_ID + base64
 * GCP_SA_KEY). Columns: title, video_id, date, added_to_db,
 * date_added_to_db, games, Day Winner(s).
 */
export async function readTruthSheet(): Promise<SheetRow[]> {
  const spreadsheetId = process.env.SHEET_ID;
  const rawKey = process.env.GCP_SA_KEY;
  if (!spreadsheetId || !rawKey)
    throw new Error(
      "SHEET_ID and GCP_SA_KEY must be set to read the Truth sheet (or pass --videos)",
    );

  const sa = JSON.parse(Buffer.from(rawKey.trim(), "base64").toString("utf8"));
  const auth = new google.auth.JWT({
    email: sa.client_email,
    key: sa.private_key,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
  const sheets = google.sheets({ version: "v4", auth });
  const { data } = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: "Truth!A:G",
  });

  return (data.values ?? []).slice(1).map((r) => ({
    title: r[0] ?? "",
    videoId: r[1] ?? "",
    date: r[2] ?? "",
    addedToDb: String(r[3] ?? "").toUpperCase() === "TRUE",
    games: r[5] ?? "",
  }));
}

/** Profiles whose name or alias appears in a free-text "games" cell. */
export function profilesForGamesCell(
  cell: string,
  profiles: readonly GameProfile[],
): GameProfile[] {
  const parts = cell
    .toLowerCase()
    .split(/[,;/&+\n]|\band\b/)
    .map((part) => part.trim())
    .filter(Boolean);
  return profiles.filter((profile) => {
    const names = [profile.displayName.toLowerCase(), ...(profile.sheetAliases ?? [])];
    return parts.some((part) => names.includes(part));
  });
}

/**
 * Turns sheet rows into (video, game) work items: rows not yet marked
 * added_to_db whose games cell names a game the harvester can analyze.
 * Newest first, so a backlog never starves this week's uploads.
 */
export function candidatesFromSheet(
  rows: SheetRow[],
  profiles: readonly GameProfile[],
): CandidateVideo[] {
  const analyzable = profiles.filter((profile) => profile.azureGameId);
  const out: CandidateVideo[] = [];
  for (const row of rows) {
    if (row.addedToDb) continue;
    const videoId =
      extractYoutubeId(row.videoId) ??
      (/^[A-Za-z0-9_-]{11}$/.test(row.videoId.trim()) ? row.videoId.trim() : null);
    if (!videoId) continue;
    for (const profile of profilesForGamesCell(row.games, analyzable))
      out.push({ videoId, title: row.title, date: row.date, profile });
  }
  return out.sort((a, b) => Date.parse(b.date) - Date.parse(a.date) || 0);
}
