import { runCapture } from "../utils";
import type { VideoMeta } from "../draft/write-draft";

interface YtDlpInfo {
  id: string;
  title?: string;
  webpage_url?: string;
  thumbnail?: string;
  timestamp?: number;
  release_timestamp?: number;
  upload_date?: string;
}

/**
 * Reads title, publish time, and thumbnail with `yt-dlp -J` — no YouTube Data
 * API key needed. Live VODs report `release_timestamp` (stream start), which
 * is what the admin form's YouTube lookup dates sessions by.
 */
export async function fetchVideoMeta(args: {
  ytDlpPath: string;
  ytDlpArgs?: string[];
  videoId: string;
}): Promise<VideoMeta> {
  const { ytDlpPath, ytDlpArgs = [], videoId } = args;
  const url = `https://www.youtube.com/watch?v=${videoId}`;
  const raw = await runCapture(ytDlpPath, [
    ...ytDlpArgs,
    "-J",
    "--no-playlist",
    "--skip-download",
    url,
  ]);
  const info = JSON.parse(raw) as YtDlpInfo;

  const epoch = info.release_timestamp ?? info.timestamp;
  let date: Date;
  if (epoch) date = new Date(epoch * 1000);
  else if (info.upload_date)
    date = new Date(
      `${info.upload_date.slice(0, 4)}-${info.upload_date.slice(4, 6)}-${info.upload_date.slice(6, 8)}T00:00:00Z`,
    );
  else date = new Date();

  return {
    videoId,
    title: info.title ?? videoId,
    url: info.webpage_url ?? url,
    thumbnail:
      info.thumbnail ?? `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`,
    date,
  };
}
