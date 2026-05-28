import { spawn, SpawnOptions } from "child_process";

/**
 * Runs a command with inherited stdio and resolves on clean exit. Used for
 * long-running tools like yt-dlp and ffmpeg where we want progress visible.
 *
 * @param cmd - The executable to run.
 * @param args - Arguments to pass to the executable.
 * @param opts - Optional spawn options.
 * @returns A promise that resolves on exit code 0, rejects otherwise.
 */
export function runSpawn(
  cmd: string,
  args: string[],
  opts: SpawnOptions = {},
): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { stdio: "inherit", ...opts });
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} exited with code ${code}`));
    });
    proc.on("error", reject);
  });
}

/**
 * Runs a command and captures stdout. Used for tools whose output we need to
 * parse (ffprobe, vision-ocr).
 *
 * @param cmd - The executable to run.
 * @param args - Arguments to pass to the executable.
 * @returns A promise resolving to stdout as a UTF-8 string.
 */
export function runCapture(cmd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args);
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (d) => (stdout += d));
    proc.stderr.on("data", (d) => (stderr += d));
    proc.on("close", (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(stderr.trim() || `${cmd} exit ${code}`));
    });
    proc.on("error", reject);
  });
}

/**
 * Formats seconds as HH-MM-SS for use in filenames (no colons, filesystem-safe).
 */
export function fmtTime(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  return `${pad(h)}-${pad(m)}-${pad(s)}`;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * Extracts a YouTube video ID from a URL. Supports watch, youtu.be, shorts, embed.
 *
 * @param url - The URL to parse.
 * @returns The 11-character video ID, or null if no match.
 */
export function extractYoutubeId(url: string): string | null {
  const m = url.match(
    /(?:youtu\.be\/|v=|\/embed\/|\/shorts\/)([A-Za-z0-9_-]{11})/,
  );
  return m ? m[1] : null;
}

/**
 * Strips shell-escape backslashes from a URL. zsh's "escape glob chars on
 * paste" feature transforms `?` → `\?` and `=` → `\=`, and those escapes can
 * survive into the program's argv when double-quoted. This is harmless for
 * normal URLs but breaks YouTube fetches since yt-dlp uses the URL literally.
 *
 * @param url - Possibly-escaped URL string.
 * @returns URL with backslash-escapes stripped from common URL metacharacters.
 */
export function sanitizeUrl(url: string): string {
  // Only strip backslashes that precede known URL metacharacters. Keeps any
  // backslashes that are intentionally part of the URL path (extremely rare).
  return url.replace(/\\([?&=#])/g, "$1");
}
