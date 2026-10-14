import { google } from "googleapis";
import { extractYoutubeId } from "../utils";
import type { GameProfile } from "../games/types";

export interface CandidateVideo {
  videoId: string;
  title: string;
  /** Sheet date string, used only for ordering and the report. */
  date: string;
  profile: GameProfile;
  /** Already-downloaded copy to read instead of YouTube (--video-dir). */
  videoPath?: string;
}

export interface SheetRow {
  title: string;
  videoId: string;
  date: string;
  addedToDb: boolean;
  games: string;
}

/**
 * Reads the "Truth" sheet that the RDC Live scraper fills (SHEET_ID + base64
 * GCP_SA_KEY). Columns are looked up by header name, since the sheet's column
 * order has changed over time (has_screenshots, date_screenshotted).
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
    range: "Truth",
  });

  const [header = [], ...rows] = data.values ?? [];
  const col = (name: string) => {
    const i = header.findIndex((h) => String(h).trim().toLowerCase() === name);
    if (i < 0) throw new Error(`Truth sheet has no "${name}" column`);
    return i;
  };
  const [title, videoId, date, addedToDb, games] = [
    "title",
    "video_id",
    "date",
    "added_to_db",
    "games",
  ].map(col);

  return rows.map((r) => ({
    title: r[title] ?? "",
    videoId: r[videoId] ?? "",
    date: r[date] ?? "",
    addedToDb: String(r[addedToDb] ?? "").toUpperCase() === "TRUE",
    games: r[games] ?? "",
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
 * added_to_db whose games cell names a game with a harvester profile.
 * Newest first, so a backlog never starves this week's uploads.
 */
export function candidatesFromSheet(
  rows: SheetRow[],
  profiles: readonly GameProfile[],
): CandidateVideo[] {
  const out: CandidateVideo[] = [];
  for (const row of rows) {
    if (row.addedToDb) continue;
    const videoId =
      extractYoutubeId(row.videoId) ??
      (/^[A-Za-z0-9_-]{11}$/.test(row.videoId.trim()) ? row.videoId.trim() : null);
    if (!videoId) continue;
    for (const profile of profilesForGamesCell(row.games, profiles))
      out.push({ videoId, title: row.title, date: row.date, profile });
  }
  return out.sort((a, b) => Date.parse(b.date) - Date.parse(a.date) || 0);
}
