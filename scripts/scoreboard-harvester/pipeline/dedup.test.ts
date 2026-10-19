import sharp from "sharp";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { clusterConsecutive, sharpnessScore } from "./dedup";

/** Hard black/white 8px checkerboard: as much edge as an image gets. */
const checkerboard = (width: number, height: number) => {
  const pixels = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const v = ((x >> 3) + (y >> 3)) % 2 ? 255 : 0;
      pixels.fill(v, (y * width + x) * 3, (y * width + x) * 3 + 3);
    }
  return sharp(pixels, { raw: { width, height, channels: 3 } });
};

describe("sharpnessScore", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "sharpness-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("scores a crisp frame above a blurred copy of it, and a flat frame at 0", async () => {
    const crisp = join(dir, "crisp.png");
    const blurred = join(dir, "blurred.png");
    const flat = join(dir, "flat.png");
    await checkerboard(1280, 720).png().toFile(crisp);
    await checkerboard(1280, 720).blur(3).png().toFile(blurred);
    await sharp({
      create: { width: 1280, height: 720, channels: 3, background: "#2a6e2a" },
    }).toFile(flat);

    expect(await sharpnessScore(crisp)).toBeGreaterThan(
      (await sharpnessScore(blurred)) * 2,
    );
    expect(await sharpnessScore(flat)).toBe(0);
  });
});

describe("clusterConsecutive", () => {
  const record = (frameId: number, timestampSec: number) => ({
    frameId,
    filePath: `/frames/${frameId}.jpg`,
    timestampSec,
  });

  it("splits runs on a timestamp gap, not a frame-id gap", () => {
    // Keyframe sampling: ids are consecutive but the third frame is 40s later.
    const runs = clusterConsecutive(
      [record(1, 0), record(2, 5), record(3, 45), record(4, 50)],
      20,
    );
    expect(runs.map((run) => run.map((r) => r.frameId))).toEqual([
      [1, 2],
      [3, 4],
    ]);
  });
});
