/**
 * Game processors log every field and console.error every unmapped gamertag.
 * That buries harvest progress, so mute the console while one screenshot is
 * processed. Re-entrant: Mario Kart reads several races at once. Set
 * HARVEST_VERBOSE=1 to see it all.
 */
let depth = 0;
let saved: Pick<Console, "log" | "warn" | "error"> | null = null;

export async function withQuietLogs<T>(fn: () => Promise<T>): Promise<T> {
  if (process.env.HARVEST_VERBOSE) return fn();
  if (depth === 0) {
    saved = { log: console.log, warn: console.warn, error: console.error };
    const mute = () => {};
    console.log = console.warn = console.error = mute;
  }
  depth++;
  try {
    return await fn();
  } finally {
    depth--;
    if (depth === 0 && saved) {
      Object.assign(console, saved);
      saved = null;
    }
  }
}
