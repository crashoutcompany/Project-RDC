import { describe, expect, it } from "vitest";
import { buildGameOutputSchema, buildVisionPrompt } from "./game-specs";

const teamsWithKey = (teamKey: string) => ({
  teams: [{ teamKey, players: [{ name: "Mark", rl_goals: 3 }] }],
});

describe("buildGameOutputSchema", () => {
  it("only accepts the team keys the bridge can map for Rocket League", () => {
    const schema = buildGameOutputSchema(2);

    expect(schema.safeParse(teamsWithKey("blue")).success).toBe(true);
    expect(schema.safeParse(teamsWithKey("orange")).success).toBe(true);
    // What a local 7B model actually answered: unmappable, so every team was dropped.
    expect(schema.safeParse(teamsWithKey("BlueTeam")).success).toBe(false);
    expect(schema.safeParse(teamsWithKey("Mark")).success).toBe(false);
  });
});

describe("buildVisionPrompt", () => {
  it("tells the model to return nothing, not roster names, when there's no stats table", () => {
    const prompt = buildVisionPrompt(2, ["Mark"]);

    expect(prompt).toContain("no stats table");
    expect(prompt).toContain("return no players at all");
    expect(prompt).toContain("Never add a player because they are in the known players list");
  });
});
