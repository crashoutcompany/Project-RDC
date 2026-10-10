import { matchKeywords } from "./keywords";

const RL = ["WINNER", "SCORE", "GOALS", "ASSISTS", "SAVES", "SHOTS", "MVP"];

test("counts standalone scoreboard headers", () => {
  const lines = ["MY ACCOLADES", "WINNER", "BLUE", "SCORE", "GOALS", "Assists", "SAVES", "SHOTS", "PING"];
  expect(matchKeywords(lines, RL)).toEqual(["WINNER", "SCORE", "GOALS", "ASSISTS", "SAVES", "SHOTS"]);
});

test("ignores keywords buried in live-chat lines", () => {
  const lines = [
    "Madonazo You cant score on the big fish",
    "SCORE SO HURRY",
    "Ophthalmophobia The best striker MVP",
    "Warrio379 Ben's been the best. Des overrated",
  ];
  expect(matchKeywords(lines, RL)).toEqual([]);
});

test("accepts a merged header row and allowed noise words", () => {
  expect(matchKeywords(["SCORE GOALS ASSISTS SAVES SHOTS PING"], RL, ["PING"])).toEqual([
    "SCORE",
    "GOALS",
    "ASSISTS",
    "SAVES",
    "SHOTS",
  ]);
  expect(matchKeywords(["SCORE GOALS ASSISTS SAVES SHOTS PING"], RL)).toEqual([]);
});

test("multi-word sentinels tolerate a short countdown tail", () => {
  const keywords = ["NEXT MATCH IN"];
  expect(matchKeywords(["NEXT MATCH IN 53"], keywords)).toEqual(keywords);
  expect(matchKeywords(["next match in 5 minutes guys"], keywords)).toEqual([]);
});

test("strips OCR punctuation noise", () => {
  expect(matchKeywords(["GOALS:", "-SAVES-"], RL)).toEqual(["GOALS", "SAVES"]);
});
