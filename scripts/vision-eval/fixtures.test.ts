import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadFixtures } from "./fixtures";

const writeCase = (
  dir: string,
  id: string,
  expected: object | undefined,
  { imageExt = "png" }: { imageExt?: string } = {},
) => {
  const caseDir = join(dir, id);
  mkdirSync(caseDir, { recursive: true });
  if (expected) {
    writeFileSync(join(caseDir, "expected.json"), JSON.stringify(expected));
  }
  writeFileSync(join(caseDir, `image.${imageExt}`), "fake-image-bytes");
};

describe("loadFixtures", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "vision-eval-fixtures-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("returns an empty list for a missing directory", () => {
    expect(loadFixtures(join(dir, "does-not-exist"))).toEqual([]);
  });

  it("loads a well-formed case, base64-encoding the image", () => {
    writeCase(dir, "case-1", {
      gameId: 2,
      sessionPlayers: ["Mark", "Dylan"],
      players: [{ name: "Mark", stats: { RL_GOALS: "3" } }],
      winners: ["Mark"],
    });

    const fixtures = loadFixtures(dir);
    expect(fixtures).toHaveLength(1);
    expect(fixtures[0].id).toBe("case-1");
    expect(fixtures[0].gameId).toBe(2);
    expect(fixtures[0].sessionPlayers).toEqual([
      { playerId: 1, playerName: "Mark" },
      { playerId: 2, playerName: "Dylan" },
    ]);
    expect(fixtures[0].expected.winners).toEqual(["Mark"]);
    expect(fixtures[0].imageBase64).toBe(
      Buffer.from("fake-image-bytes").toString("base64"),
    );
  });

  it("defaults winners to an empty array when omitted", () => {
    writeCase(dir, "case-2", {
      gameId: 1,
      sessionPlayers: ["Mark"],
      players: [{ name: "Mark", stats: { MK8_POS: "1" } }],
    });
    expect(loadFixtures(dir)[0].expected.winners).toEqual([]);
  });

  it("accepts jpg and jpeg image extensions", () => {
    writeCase(
      dir,
      "case-3",
      { gameId: 1, sessionPlayers: ["Mark"], players: [] },
      { imageExt: "jpeg" },
    );
    expect(loadFixtures(dir)).toHaveLength(1);
  });

  it("skips a case missing expected.json", () => {
    const caseDir = join(dir, "case-4");
    mkdirSync(caseDir, { recursive: true });
    writeFileSync(join(caseDir, "image.png"), "bytes");
    expect(loadFixtures(dir)).toEqual([]);
  });

  it("skips a case missing an image file", () => {
    const caseDir = join(dir, "case-5");
    mkdirSync(caseDir, { recursive: true });
    writeFileSync(
      join(caseDir, "expected.json"),
      JSON.stringify({ gameId: 1, sessionPlayers: [], players: [] }),
    );
    expect(loadFixtures(dir)).toEqual([]);
  });

  it("skips a plain file at the top level (non-directory)", () => {
    writeFileSync(join(dir, "README.md"), "not a case");
    writeCase(dir, "case-6", {
      gameId: 1,
      sessionPlayers: ["Mark"],
      players: [],
    });
    expect(loadFixtures(dir)).toHaveLength(1);
  });

  it("sorts fixtures by case id", () => {
    writeCase(dir, "b-case", { gameId: 1, sessionPlayers: [], players: [] });
    writeCase(dir, "a-case", { gameId: 1, sessionPlayers: [], players: [] });
    expect(loadFixtures(dir).map((f) => f.id)).toEqual(["a-case", "b-case"]);
  });

  it("warns about a fixture that is still an unreviewed harvester draft", () => {
    writeCase(dir, "draft-case", {
      _draft: true,
      gameId: 2,
      sessionPlayers: ["Mark"],
      players: [{ name: "Mark", stats: { RL_GOALS: "3" } }],
    });

    expect(loadFixtures(dir)).toHaveLength(1);
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining("draft-case: expected.json is still an unreviewed harvester draft"),
    );
  });
});
