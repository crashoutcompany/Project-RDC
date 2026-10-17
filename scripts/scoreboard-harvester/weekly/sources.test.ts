import { marioKart8 } from "../games/mario-kart-8";
import { rocketLeague } from "../games/rocket-league";
import { candidatesFromSheet, profilesForGamesCell } from "./sources";

const profiles = [rocketLeague, marioKart8];

test("matches free-text game cells by name or alias", () => {
  expect(profilesForGamesCell("Rocket League, MK8", profiles).map((p) => p.id)).toEqual([
    "rocket-league",
    "mario-kart-8",
  ]);
  expect(profilesForGamesCell("Mario Kart and Rocket League", profiles)).toHaveLength(2);
  expect(profilesForGamesCell("Rocket League Sideswipe", profiles)).toEqual([]);
});

test("queues un-added rows for games with a profile, newest first", () => {
  const rows = [
    { title: "old", videoId: "https://youtu.be/AAAAAAAAAAA", date: "2026-09-01", addedToDb: false, games: "Rocket League" },
    { title: "done", videoId: "BBBBBBBBBBB", date: "2026-10-01", addedToDb: true, games: "Rocket League" },
    { title: "new", videoId: "CCCCCCCCCCC", date: "2026-10-05", addedToDb: false, games: "Rocket League; Lethal Company" },
    { title: "junk", videoId: "not-an-id", date: "2026-10-06", addedToDb: false, games: "Rocket League" },
  ];

  expect(candidatesFromSheet(rows, profiles).map((c) => [c.videoId, c.profile.id])).toEqual([
    ["CCCCCCCCCCC", "rocket-league"],
    ["AAAAAAAAAAA", "rocket-league"],
  ]);
});
