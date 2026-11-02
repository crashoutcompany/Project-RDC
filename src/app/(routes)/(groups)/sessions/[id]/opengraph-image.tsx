import { getApprovedSession } from "prisma/lib/public-session";
import { findPlayer } from "@/app/(routes)/admin/_utils/player-mappings";
import {
  ogImageResponse,
  OG_CONTENT_TYPE,
  OG_SIZE,
  publicImageDataUrl,
  remoteImageDataUrl,
} from "@/lib/og";
import { formatSessionDate } from "@/lib/utils";

export const alt = "Session recap on RDC Stats Tracker";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function Image({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const result = /^\d+$/.test(id) ? await getApprovedSession(Number(id)) : null;
  const session = result?.success && result.data ? result.data : null;
  if (!session)
    return ogImageResponse({
      eyebrow: "RDC Stats Tracker",
      title: "Session not found",
    });

  const { Game, sessionName, date, thumbnail, dayWinners, mvp } = session;
  const dayWinner = dayWinners.map((p) => p.playerName).join(", ");
  const mvpImage = mvp ? findPlayer(mvp.playerName)?.image : null;

  return ogImageResponse({
    eyebrow: `${Game.gameName} · ${formatSessionDate(date)}`,
    title: sessionName,
    art:
      (await remoteImageDataUrl(thumbnail)) ??
      (await publicImageDataUrl(mvpImage)),
    stats: [
      { label: "Day won by", value: dayWinner || "TBD", color: "#ffd400" },
      { label: "MVP", value: mvp?.playerName ?? "TBD", color: "#2d9cff" },
    ],
  });
}
