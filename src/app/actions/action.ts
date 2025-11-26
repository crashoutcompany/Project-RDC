"use server";

import prisma from "prisma/db";
import config from "@/lib/config";
// import { Session } from "next-auth";
import { auth, Session } from "@/lib/auth";
import { headers } from "next/headers";
import { errorCodes } from "@/lib/constants";
import { redirect } from "next/navigation";
import posthog from "@/posthog/server-init";
import { PostHogEvents } from "@/posthog/events";
import { revalidatePath } from "next/cache";

/**
 * Updates the authentication status based on the provided session.
 *
 * If a session is provided, it signs out the user and redirects to the home page.
 * If no session is provided, it redirects the user to the sign-in page.
 *
 * @param {Session | null} session - The current user session.
 * @returns {Promise<void>} A promise that resolves when the operation is complete.
 */
export const updateAuthStatus = async (session: Session | null) => {
  if (session) {
    revalidatePath("/", "layout");
    await auth.api.signOut({ headers: await headers() });
    redirect("/");
  } else redirect("/signin");
};

/**
 * Fetches and validates YouTube video details for RDC sessions
 *
 * @description
 * This server action:
 * 1. Validates that the video ID isn't already in use
 * 2. Fetches video metadata from YouTube API
 * 3. Formats video data for session storage
 * 4. Handles errors including authentication failures
 * 5. Revalidates cached data on successful fetch
 *
 * @param videoId - The YouTube video ID to fetch details for
 * @returns Object containing video details or error information
 * @throws Returns error object if video fetch fails or authentication is invalid
 *
 * @example
 * const { video, error } = await getRDCVideoDetails('dQw4w9WgXcQ', 'Rocket League', 'distinct-id-123');
 * if (error) {
 *   // Handle error case
 * } else {
 *   // Use video details
 * }
 */
export const getRDCVideoDetails = async (
  videoId: string,
  gameName: string,
  distinctId: string,
): GetRdcVideoDetails => {
  // TODO Maybe only validate if it's a valid video when clicking next.
  try {
    const isAuthenticated = await auth.api.getSession({
      headers: await headers(),
    });
    if (!isAuthenticated) {
      posthog.capture({
        event: PostHogEvents.VIDEO_FETCH_DENIED,
        distinctId,
        properties: { reason: "User not authenticated" },
      });
      return { video: null, error: errorCodes.NotAuthenticated };
    }

    const dbRecord = await prisma.session.findFirst({
      where: { videoId },
      include: { Game: true },
    });
    const apiKey = config.YOUTUBE_API_KEY;

    if (!dbRecord) {
      const apiUrl = `https://youtube.googleapis.com/youtube/v3/videos?part=snippet&part=player&id=${videoId}&key=${apiKey}`;
      const YTvideo = await fetch(apiUrl);

      if (!apiKey) {
        console.log("YOUTUBE API KEY NOT CONFIGURED");
        // TODO Move Posthog calls to analytics file.
        posthog.captureException("YOUTUBE API KEY NOT CONFIGURED", distinctId);
      }

      if (!YTvideo.ok) {
        posthog.captureException(await YTvideo.json(), distinctId);
        return {
          error: "Something went wrong. Please try again.",
          video: null,
        };
      }

      const json = (await YTvideo.json()) as YouTubeVideoListResponse;
      const video = json.items[0];

      if (video?.snippet.channelTitle !== "RDC Live")
        return { error: "Please upload a video by RDC Live", video: null };

      const session: YTAPIRequestSession = {
        sessionUrl: `https://youtube.com/watch?v=${video.id}`,
        date: new Date(video.snippet.publishedAt),
        sessionName: video.snippet.title,
        thumbnail:
          video.snippet.thumbnails.maxres || video.snippet.thumbnails.high,
      };
      return { video: session, error: undefined };
    } else if (dbRecord.Game.gameName === gameName)
      return { video: dbRecord, error: "Video already exists" };
    else return { video: dbRecord, error: undefined };
  } catch (error) {
    console.error("Error in getRDCVideoDetails:", error);
    return { video: null, error: "An unexpected error occurred" };
  }
};

type YouTubeVideoListResponse = {
  kind: "youtube#videoListResponse";
  etag: string;
  items: {
    kind: "youtube#video";
    etag: string;
    id: string;
    snippet: {
      publishedAt: string;
      channelId: string;
      title: string;
      description: string;
      thumbnails: {
        default: Thumbnail;
        medium: Thumbnail;
        high: Thumbnail;
        standard?: Thumbnail;
        maxres?: Thumbnail;
      };
      channelTitle: string;
      tags?: string[];
      categoryId: string;
      liveBroadcastContent: string;
      localized: {
        title: string;
        description: string;
      };
      defaultAudioLanguage?: string;
    };
    player: {
      embedHtml: string;
    };
  }[];
  pageInfo: {
    totalResults: number;
    resultsPerPage: number;
  };
};

type Thumbnail = {
  url: string;
  width: number;
  height: number;
};

type FindManySessions = Awaited<ReturnType<typeof prisma.session.findMany>>[0];

type YTAPIRequestSession = Pick<
  FindManySessions,
  "date" | "sessionName" | "sessionUrl"
> & {
  thumbnail: Thumbnail;
};

type GetRdcVideoDetails = Promise<
  | { video: FindManySessions | YTAPIRequestSession; error: undefined }
  | { video: null; error: string }
  | { video: FindManySessions | YTAPIRequestSession; error: string }
>;
