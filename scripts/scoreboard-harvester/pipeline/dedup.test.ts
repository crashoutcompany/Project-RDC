import sharp from "sharp";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sharpnessScore } from "./dedup";

const REFERENCE = join(
  import.meta.dirname,
  "../reference/rocket-league/scoreboard.png",
);

describe("sharpnessScore", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "sharpness-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("scores a crisp frame above a blurred copy of it, and a flat frame at 0", async () => {
    const blurred = join(dir, "blurred.png");
    const flat = join(dir, "flat.png");
    await sharp(REFERENCE).blur(3).toFile(blurred);
    await sharp({
      create: { width: 1280, height: 720, channels: 3, background: "#2a6e2a" },
    }).toFile(flat);

    const crisp = await sharpnessScore(REFERENCE);
    expect(crisp).toBeGreaterThan((await sharpnessScore(blurred)) * 2);
    expect(await sharpnessScore(flat)).toBe(0);
  });
});
