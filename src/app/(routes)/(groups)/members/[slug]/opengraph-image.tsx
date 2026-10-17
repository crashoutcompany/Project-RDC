import { getFighterArt } from "@/lib/fighters";
import {
  ogImageResponse,
  OG_CONTENT_TYPE,
  OG_SIZE,
  publicImageDataUrl,
} from "@/lib/og";
import { getMemberCardData } from "@/lib/og-data";

export const alt = "Fighter profile on RDC Stats Tracker";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function Image({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const member = await getMemberCardData(slug);
  if (!member.success || !member.data)
    return ogImageResponse({
      eyebrow: "RDC Stats Tracker",
      title: "Fighter not found",
    });

  const { playerName, _count } = member.data;
  return ogImageResponse({
    eyebrow: "Fighter profile",
    title: playerName,
    art: await publicImageDataUrl(getFighterArt(playerName).portrait),
    stats: [
      { label: "Match wins", value: _count.matchWins, color: "#ffd400" },
      { label: "Set wins", value: _count.setWins, color: "#2d9cff" },
      { label: "Day wins", value: _count.dayWins, color: "#ff2d55" },
    ],
  });
}
