import { rocketLeague } from "../../games/rocket-league";
import { matchKeywords, type KeywordRules } from "./ocr";

const rules: KeywordRules = {
  keywords: rocketLeague.keywords,
  minKeywords: 4,
  endScreenSentinel: "WINNER",
  requireEndScreen: false,
};

describe("matchKeywords", () => {
  it("confirms a frame at the keyword threshold, case-insensitively", () => {
    const verdict = matchKeywords(["Score", "goals assists", "SAVES"], rules);
    expect(verdict.isScoreboard).toBe(true);
    expect(verdict.evidence).toEqual(["SCORE", "GOALS", "ASSISTS", "SAVES"]);
  });

  it("rejects a frame below the threshold", () => {
    expect(matchKeywords(["SCORE", "GOALS", "0:42"], rules).isScoreboard).toBe(
      false,
    );
  });

  it("requires the sentinel only when requireEndScreen is on", () => {
    const lines = ["SCORE", "GOALS", "ASSISTS", "SAVES", "SHOTS"];
    expect(matchKeywords(lines, rules).isScoreboard).toBe(true);
    expect(
      matchKeywords(lines, { ...rules, requireEndScreen: true }).isScoreboard,
    ).toBe(false);
    expect(
      matchKeywords([...lines, "BLUE WINNER"], {
        ...rules,
        requireEndScreen: true,
      }).isScoreboard,
    ).toBe(true);
  });

  it("finds a sentinel that isn't in the keyword list by scanning lines", () => {
    const verdict = matchKeywords(["SCORE", "GOALS", "ASSISTS", "SAVES", "VICTORY!"], {
      ...rules,
      endScreenSentinel: "VICTORY",
      requireEndScreen: true,
    });
    expect(verdict.isScoreboard).toBe(true);
  });
});
