import { google } from "googleapis";
import { NextRequest, NextResponse } from "next/server";
import config from "../../../lib/config";
import { getVideoId } from "@/app/(routes)/admin/_utils/helper-functions";
import prisma from "prisma/db";
import { generateText } from "ai";
import { google as aiGoogle } from "@ai-sdk/google";
import { withTracing } from "@posthog/ai";
import posthog from "@/posthog/server-init";
import {
  logAiGenFailure,
  logAiGenSuccess,
  logDriveCronJobError,
  logDriveCronJobSuccess,
} from "@/posthog/server-analytics";
import { PostHogEvents } from "@/posthog/events";

// Serverless-compatible helper to parse base64-encoded service account JSON from env
// TODO Add logging
function getServiceAccount(): {
  client_email: string;
  private_key: string;
  [key: string]: unknown;
} | null {
  const raw = config.GCP_SA_KEY;
  if (!raw) return null;
  try {
    const decoded = Buffer.from(raw.trim(), "base64").toString("utf8");
    return JSON.parse(decoded);
  } catch {
    logDriveCronJobError("Failed to parse GCP_SA_KEY (base64)");
    return null;
  }
}

export async function GET(req: NextRequest) {
  // Ensure only authorized cron jobs can access this route

  const cronSecret = config.CRON_SECRET;
  const authHeader = req.headers.get("authorization") ?? "";

  if (!cronSecret) return new Response("Missing cron secret", { status: 500 });

  if (authHeader !== `Bearer ${cronSecret}`)
    return new Response("Unauthorized", { status: 401 });

  // Start work

  const sa = getServiceAccount();
  const spreadsheetId = config.SHEET_ID;

  if (!sa) {
    logDriveCronJobError("Service account key not found in env GCP_SA_KEY");
    return NextResponse.json(
      { ok: false, error: "missing_service_account" },
      { status: 500 },
    );
  }
  if (!spreadsheetId) {
    logDriveCronJobError("SHEET_ID not set");
    return NextResponse.json(
      { ok: false, error: "missing_sheet_id" },
      { status: 500 },
    );
  }

  try {
    // load last processed row for this sheet
    const sheetName = "Truth";
    const sync = await prisma.sheetSync.findUnique({ where: { sheetName } });
    const startRow = (sync?.lastRow ?? 0) + 1;
    const range = `${sheetName}!A${startRow}:G`; // fetch only new rows

    const client = new google.auth.JWT({
      email: sa.client_email,
      key: sa.private_key,
      scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
    });

    await client.authorize();

    const sheets = google.sheets({ version: "v4", auth: client });
    const [truth, dashboard] = await Promise.all([
      sheets.spreadsheets.values.get({ spreadsheetId, range }),
      sheets.spreadsheets.values.get({ spreadsheetId, range: "Dashboard!A:B" }),
    ]);

    // A lot of this is dependent on rows not being deleted.
    if (truth.data.values && truth.data.values.length > 0) {
      // maybe filter out rows that were added to db
      const { items } = parseTruthRows(truth.data.values || []);
      const dashboardRows = dashboard.data.values || [];
      const newLastRow = startRow + items.length - 1;
      // optionally compute lastVideoId from the final row
      const lastVideoId = getVideoId(items.at(-1)?.videoId || "");
      let summary: string | null = null;
      try {
        const model = withTracing(aiGoogle("gemini-2.5-flash"), posthog, {
          posthogDistinctId: "cron-job",
          posthogProperties: {
            source: "google-drive-sync",
          },
        });

        const { text } = await generateText({
          model: model,
          system:
            "You are a concise summarizer. Produce a short summary highlighting the new rows inserted",
          prompt: `Summarize the following ${items.length} new sheet rows into a short, human-readable summary. Rows: ${JSON.stringify(
            items,
          )}`,
        });

        summary = text;
        logAiGenSuccess(
          PostHogEvents.GOOGLE_DRIVE_SUMMARY_GENERATION_SUCCESS,
          "cron-job",
          {
            summary,
            newLastRow,
            lastVideoId,
          },
        );
      } catch (aiErr) {
        logAiGenFailure(aiErr, "cron-job");
        summary = null;
      }

      await prisma.sheetSync.upsert({
        where: { sheetName },
        create: { sheetName, lastRow: newLastRow, lastVideoId, summary },
        update: { lastRow: newLastRow, lastVideoId, summary },
      });

      return NextResponse.json({
        ok: true,
        rowCount: items.length,
        truthRows: items,
        dashboardRows,
      });
    }

    logDriveCronJobSuccess("Successfully retrieved rows");

    return NextResponse.json({ ok: true }, { status: 204 });
  } catch (err) {
    logDriveCronJobError("Error reading google sheet", { err });
    return NextResponse.json(
      { ok: false, error: "Error reading google sheet" },
      { status: 500 },
    );
  }
}

type TruthHeader = [
  "title",
  "video_id",
  "date",
  "added_to_db",
  "date_added_to_db",
  "games",
  "Day Winner(s)",
];

type Truth = {
  title: string;
  videoId: string;
  date: string; // keep as string; parse to Date where needed
  addedToDb: boolean;
  dateAddedToDb?: string;
  games: string;
  dayWinners?: string;
};

// Helper to map raw 2D array to typed objects
function parseTruthRows(rows: string[][]): {
  header: TruthHeader;
  items: Truth[];
} {
  const header = rows[0] as TruthHeader;
  const items: Truth[] = rows.slice(1).map((r) => ({
    title: r[0] ?? "",
    videoId: r[1] ?? "",
    date: r[2] ?? "",
    addedToDb: String(r[3] ?? "").toUpperCase() === "TRUE",
    dateAddedToDb: r[4] || undefined,
    games: r[5] ?? "",
    dayWinners: r[6] || undefined,
  }));
  return { header, items };
}
