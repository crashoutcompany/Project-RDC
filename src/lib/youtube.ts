/**
 * Builds a YouTube Data API v3 videos.list URL for session metadata.
 *
 * `part` must be a single comma-separated value. URLSearchParams.set()
 * overwrites duplicate keys, so calling set("part", "snippet") then
 * set("part", "player") would request only player and omit title, channel,
 * publish date, and thumbnails needed to link a session.
 *
 * @param videoId - 11-character YouTube video ID
 * @param apiKey - YouTube Data API key
 * @returns Absolute videos.list URL including snippet and player parts
 */
export function buildYouTubeVideosListUrl(
  videoId: string,
  apiKey: string,
): string {
  const apiUrl = new URL("https://youtube.googleapis.com/youtube/v3/videos");
  apiUrl.searchParams.set("part", "snippet,player");
  apiUrl.searchParams.set("id", videoId);
  apiUrl.searchParams.set("key", apiKey);
  return apiUrl.toString();
}

/**
 * The host YouTube serves video thumbnails from, and the only remote image
 * host for thumbnails allowed in next.config.ts.
 */
export const YOUTUBE_THUMBNAIL_HOST = "i.ytimg.com";

/** Whether `url` is an https image on YouTube's thumbnail host. */
export function isYouTubeThumbnailUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === "https:" && parsed.hostname === YOUTUBE_THUMBNAIL_HOST
    );
  } catch {
    return false;
  }
}
