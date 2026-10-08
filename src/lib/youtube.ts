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
