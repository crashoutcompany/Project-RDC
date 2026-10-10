import fs from "fs";
import path from "path";
import prisma from "prisma/db";
import { Resend } from "resend";
import type { DepCheckResult } from "../pipeline/deps";
import { fetchVideoMeta } from "../pipeline/metadata";
import { harvestVideo } from "../harvest";
import { buildDraft } from "../draft/build-draft";
import { writeDraftSession } from "../draft/write-draft";
import type { GameProfile } from "../games/types";
import type { ResolvedConfig } from "../types";
import { fmtTime } from "../utils";
import {
  CandidateVideo,
  candidatesFromSheet,
  readTruthSheet,
} from "./sources";

const MAX_ATTEMPTS = 3;

type Outcome =
  | "drafted"
  | "dry-run"
  | "exists"
  | "no-scoreboards"
  | "failed";

interface StateEntry {
  outcome: Outcome;
  attempts: number;
  lastRun: string;
  sessionId?: number;
  message?: string;
}

type State = Record<string, StateEntry>;

interface ReportLine {
  candidate: CandidateVideo;
  outcome: Outcome | "skipped";
  detail: string;
}

export interface WeeklyOptions {
  profiles: readonly GameProfile[];
  configFor: (profile: GameProfile) => ResolvedConfig;
  deps: DepCheckResult;
  out: string;
  /** Save drafts to the database. Without it, drafts are written to disk only. */
  write: boolean;
  /** Max videos to process this run (each takes ~20–40 min on a Pi). */
  limit: number;
  /** Explicit work list instead of the Google Sheet. */
  videos?: { videoId: string; profile: GameProfile }[];
  /** Retry videos that previously failed or found no scoreboards. */
  retry: boolean;
}

const stateKey = (c: { videoId: string; profile: GameProfile }) =>
  `${c.profile.id}:${c.videoId}`;

/**
 * The scheduled entry point: finds RDC uploads that aren't in the database
 * yet, harvests and analyzes their scoreboards, and saves each one as an
 * unapproved draft session for an admin to review in /admin/submissions.
 *
 * Safe to run on a timer: a lock file prevents overlapping runs, a state file
 * remembers what was already done, and existing sessions are never touched.
 */
export async function runWeekly(opts: WeeklyOptions): Promise<number> {
  fs.mkdirSync(opts.out, { recursive: true });
  const release = acquireLock(path.join(opts.out, ".weekly.lock"));
  if (!release) {
    console.error("[weekly] another run is in progress; exiting");
    return 0;
  }

  const startedAt = new Date();
  const statePath = path.join(opts.out, "weekly-state.json");
  const state: State = fs.existsSync(statePath)
    ? JSON.parse(fs.readFileSync(statePath, "utf8"))
    : {};
  const saveState = () =>
    fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
  const report: ReportLine[] = [];

  try {
    const candidates: CandidateVideo[] = opts.videos
      ? opts.videos.map((v) => ({ ...v, title: v.videoId, date: "" }))
      : candidatesFromSheet(await readTruthSheet(), opts.profiles);
    console.log(`[weekly] ${candidates.length} candidate video(s)`);

    const existing = await prisma.session.findMany({
      where: { videoId: { in: [...new Set(candidates.map((c) => c.videoId))] } },
      select: { sessionId: true, videoId: true, gameId: true },
    });
    const players = await prisma.player.findMany();

    const queue: CandidateVideo[] = [];
    for (const candidate of candidates) {
      const prior = state[stateKey(candidate)];
      const session = existing.find(
        (s) =>
          s.videoId === candidate.videoId &&
          s.gameId === candidate.profile.azureGameId,
      );
      if (session) {
        if (prior?.outcome !== "exists" && prior?.outcome !== "drafted")
          state[stateKey(candidate)] = {
            outcome: "exists",
            attempts: prior?.attempts ?? 0,
            lastRun: startedAt.toISOString(),
            sessionId: session.sessionId,
          };
        continue;
      }
      if (prior && !opts.videos) {
        const retryable =
          prior.outcome === "failed" ||
          prior.outcome === "dry-run" ||
          (opts.retry && prior.outcome === "no-scoreboards");
        if (!retryable) continue;
        if (prior.outcome === "failed" && prior.attempts >= MAX_ATTEMPTS && !opts.retry) {
          report.push({
            candidate,
            outcome: "skipped",
            detail: `gave up after ${prior.attempts} failed attempts (${prior.message}); rerun with --retry`,
          });
          continue;
        }
      }
      queue.push(candidate);
    }
    saveState();

    const batch = queue.slice(0, opts.limit);
    if (queue.length > batch.length)
      console.log(
        `[weekly] processing ${batch.length} of ${queue.length}; the rest wait for the next run`,
      );

    for (const candidate of batch) {
      const key = stateKey(candidate);
      const attempts = (state[key]?.attempts ?? 0) + 1;
      console.log(
        `\n[weekly] ▶ ${candidate.profile.displayName}: ${candidate.title} (${candidate.videoId})`,
      );
      try {
        const line = await processCandidate(candidate, opts, players);
        state[key] = {
          outcome: line.outcome as Outcome,
          attempts,
          lastRun: new Date().toISOString(),
          sessionId: line.sessionId,
          message: line.detail,
        };
        report.push({ candidate, outcome: line.outcome, detail: line.detail });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[weekly] ✖ ${candidate.videoId}: ${message}`);
        state[key] = {
          outcome: "failed",
          attempts,
          lastRun: new Date().toISOString(),
          message,
        };
        report.push({ candidate, outcome: "failed", detail: message });
      }
      saveState();
    }

    const markdown = renderReport({
      startedAt,
      report,
      pending: queue.length - batch.length,
      write: opts.write,
    });
    const reportDir = path.join(opts.out, "reports");
    fs.mkdirSync(reportDir, { recursive: true });
    const reportPath = path.join(
      reportDir,
      `${startedAt.toISOString().slice(0, 10)}.md`,
    );
    fs.writeFileSync(reportPath, markdown);
    console.log(`\n${markdown}\n[weekly] report → ${reportPath}`);
    await emailReport(markdown, report);

    return report.some((line) => line.outcome === "failed") ? 1 : 0;
  } finally {
    release();
    await prisma.$disconnect();
  }
}

async function processCandidate(
  candidate: CandidateVideo,
  opts: WeeklyOptions,
  players: Awaited<ReturnType<typeof prisma.player.findMany>>,
): Promise<{ outcome: Outcome; detail: string; sessionId?: number }> {
  const { profile, videoId } = candidate;
  const config = opts.configFor(profile);
  const url = `https://www.youtube.com/watch?v=${videoId}`;

  const { manifest, workDir } = await harvestVideo({
    mode: "extract",
    profile,
    config,
    deps: opts.deps,
    url,
    players,
  });

  if (manifest.matches.length === 0)
    return { outcome: "no-scoreboards", detail: "no scoreboards detected" };

  const draft = buildDraft({ matches: manifest.matches, setRule: profile.setRule });
  fs.writeFileSync(path.join(workDir, "draft.json"), JSON.stringify(draft, null, 2));

  const matchCount = draft.sets.reduce((n, s) => n + s.matches.length, 0);
  const summary =
    `${manifest.matches.length} scoreboards → ${draft.sets.length} sets / ${matchCount} matches` +
    (draft.skipped.length ? `, ${draft.skipped.length} skipped` : "") +
    (draft.warnings.length ? `, ${draft.warnings.length} to check` : "");
  const notes = [
    ...draft.skipped.map((s) => `skipped ${fmtTime(s.timestampSec)}: ${s.reason}`),
    ...draft.warnings,
  ];
  const detail = [summary, ...notes.map((n) => `  - ${n}`)].join("\n");

  if (matchCount === 0) return { outcome: "no-scoreboards", detail };
  if (!opts.write) return { outcome: "dry-run", detail };

  const video = await fetchVideoMeta({
    ytDlpPath: opts.deps.ytDlpPath,
    ytDlpArgs: opts.deps.ytDlpArgs,
    videoId,
  });
  const result = await writeDraftSession({
    prisma,
    gameId: profile.azureGameId!,
    video,
    draft,
  });
  if (result.status === "created")
    return { outcome: "drafted", detail, sessionId: result.sessionId };
  if (result.status === "exists")
    return { outcome: "exists", detail: "session appeared mid-run", sessionId: result.sessionId };
  return { outcome: "no-scoreboards", detail };
}

function renderReport(args: {
  startedAt: Date;
  report: ReportLine[];
  pending: number;
  write: boolean;
}): string {
  const { startedAt, report, pending, write } = args;
  const lines = [
    `# Scoreboard harvest — ${startedAt.toISOString().slice(0, 10)}`,
    "",
    write
      ? "Drafts are saved unapproved; review them at /admin/submissions."
      : "Dry run: drafts were written to disk only (pass --write to save them).",
    "",
  ];
  if (report.length === 0) lines.push("Nothing new to harvest.");
  for (const { candidate, outcome, detail } of report)
    lines.push(
      `- **${outcome}** · ${candidate.profile.displayName} · ${candidate.title} ` +
        `(https://youtu.be/${candidate.videoId})`,
      ...detail.split("\n").map((d) => `  ${d}`),
    );
  if (pending > 0) lines.push("", `${pending} more video(s) queued for the next run.`);
  return lines.join("\n");
}

/** Optional: email the report when HARVEST_REPORT_TO and RESEND_API_KEY are set. */
async function emailReport(markdown: string, report: ReportLine[]) {
  const to = process.env.HARVEST_REPORT_TO?.split(";").filter(Boolean);
  const apiKey = process.env.RESEND_API_KEY;
  if (!to?.length || !apiKey || report.length === 0) return;
  const drafted = report.filter((l) => l.outcome === "drafted").length;
  const failed = report.filter((l) => l.outcome === "failed").length;
  const { error } = await new Resend(apiKey).emails.send({
    from: "project-rdc@resend.dev",
    to,
    subject: `Scoreboard harvest: ${drafted} draft(s) to review${failed ? `, ${failed} failed` : ""}`,
    text: markdown,
  });
  if (error) console.warn(`[weekly] report email failed: ${error.message}`);
}

/** Returns a release function, or null when a live process holds the lock. */
function acquireLock(lockPath: string): (() => void) | null {
  if (fs.existsSync(lockPath)) {
    const pid = Number(fs.readFileSync(lockPath, "utf8"));
    try {
      if (pid) {
        process.kill(pid, 0);
        return null;
      }
    } catch {
      // Stale lock from a crashed run.
    }
  }
  fs.writeFileSync(lockPath, String(process.pid));
  return () => fs.rmSync(lockPath, { force: true });
}
