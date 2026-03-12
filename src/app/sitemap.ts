import { MetadataRoute } from "next";
import { getAllGames } from "prisma/lib/games";
import { getAllMembers } from "prisma/lib/members";

/**
 * Generates a sitemap for the Project-RDC application.
 *
 * Fetches all games and members, then constructs a sitemap with URLs for main pages, games, and members.
 * Each entry includes metadata such as last modified date, change frequency, and priority.
 *
 * @returns A promise resolving to the sitemap array.
 *
 * @example
 * const sitemap = await sitemap();
 * console.log(sitemap);
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const BASE_URL = "https://rdcstats.com";
  const [games, members] = await Promise.all([getAllGames(), getAllMembers()]);

  if (!games.success || !games.data) games.data = [];
  if (!members.success || !members.data) members.data = [];

  const gamesMeta: MetadataRoute.Sitemap = games.data.map((game) => ({
    url: `${BASE_URL}/games/${game.gameName.replace(/\s/g, "").toLowerCase()}`,
    lastModified: new Date(),
    changeFrequency: "weekly",
    priority: 1,
  }));

  const membersData: MetadataRoute.Sitemap = members.data.map((member) => ({
    url: `${BASE_URL}/members/${member.playerName.toLowerCase()}`,
    lastModified: new Date(),
    changeFrequency: "weekly",
    priority: 1,
  }));

  return [
    {
      url: BASE_URL,
      lastModified: new Date(),
      changeFrequency: "yearly",
      priority: 1,
    },
    {
      url: `${BASE_URL}/about`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${BASE_URL}/games`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.5,
    },
    {
      url: `${BASE_URL}/members`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.5,
    },
    ...gamesMeta,
    ...membersData,
  ];
}
