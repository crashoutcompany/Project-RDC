import { getArenas } from "@/lib/rdc-stats";
import {
  ogImageResponse,
  OG_CONTENT_TYPE,
  OG_SIZE,
  publicImageDataUrl,
} from "@/lib/og";

export const alt = "Game stats on RDC Stats Tracker";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function Image({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const arena = (await getArenas()).find((a) => a.slug === slug);
  if (!arena)
    return ogImageResponse({
      eyebrow: "RDC Stats Tracker",
      title: "Game not found",
    });

  return ogImageResponse({
    eyebrow: "Game dashboard",
    title: arena.name,
    subtitle: arena.champion
      ? `Current champion: ${arena.champion}`
      : "No champion yet",
    art: await publicImageDataUrl(arena.image),
    stats: [
      { label: "Sessions", value: arena.sessions, color: "#2d9cff" },
      { label: "Matches", value: arena.matches, color: "#ffd400" },
      { label: "Sets", value: arena.sets, color: "#ff2d55" },
    ],
  });
}
