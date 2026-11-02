import { ogImageResponse, OG_CONTENT_TYPE, OG_SIZE } from "@/lib/og";

export const alt = "RDC Stats Tracker";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function Image() {
  return ogImageResponse({
    eyebrow: "Real Dreams Change the World",
    title: "RDC Stats Tracker",
    subtitle: "Who's the best gamer?",
  });
}
