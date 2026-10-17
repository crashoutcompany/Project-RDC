import { getFighterArt } from "@/lib/fighters";
import {
  ogImageResponse,
  OG_CONTENT_TYPE,
  OG_SIZE,
  publicImageDataUrl,
} from "@/lib/og";
import { getMember } from "./data";

export const alt = "Fighter profile on RDC Stats Tracker";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function Image({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const member = await getMember(slug);
  if (!member.success || !member.data)
    return ogImageResponse({
      eyebrow: "RDC Stats Tracker",
      title: "Fighter not found",
    });

  const { playerName, matchWins, setWins, dayWins } = member.data;
  return ogImageResponse({
    eyebrow: "Fighter profile",
    title: playerName,
    art: await publicImageDataUrl(getFighterArt(playerName).portrait),
    stats: [
      { label: "Match wins", value: matchWins.length, color: "#ffd400" },
      { label: "Set wins", value: setWins.length, color: "#2d9cff" },
      { label: "Day wins", value: dayWins.length, color: "#ff2d55" },
    ],
  });
}
