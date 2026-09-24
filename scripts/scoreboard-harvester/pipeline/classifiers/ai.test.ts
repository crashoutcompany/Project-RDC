import { vi } from "vitest";
import sharp from "sharp";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const generateTextMock = vi.hoisted(() => vi.fn());

vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ai")>();
  return { ...actual, generateText: generateTextMock };
});

import { rocketLeague } from "../../games/rocket-league";
import type { FrameRecord } from "../../types";
import {
  buildDetectPrompt,
  createAiClassifier,
  parseTileResults,
  toVerdict,
} from "./ai";

describe("parseTileResults", () => {
  it("maps answers onto tiles by index", () => {
    const parsed = parseTileResults(
      {
        tiles: [
          { index: 2, kind: "post-match", confidence: 0.9 },
          { index: 1, kind: "other", confidence: 0.8 },
        ],
      },
      2,
    );
    expect(parsed.results).toEqual([
      { kind: "other", confidence: 0.8 },
      { kind: "post-match", confidence: 0.9 },
    ]);
    expect(parsed.missing).toEqual([false, false]);
    expect(parsed.problems).toEqual([]);
  });

  it("defaults missing tiles to other and drops out-of-range and duplicate indices", () => {
    const parsed = parseTileResults(
      {
        tiles: [
          { index: 1, kind: "post-match", confidence: 0.9 },
          { index: 1, kind: "other", confidence: 0.9 },
          { index: 7, kind: "post-match", confidence: 0.9 },
        ],
      },
      3,
    );
    expect(parsed.results[0]).toEqual({ kind: "post-match", confidence: 0.9 });
    expect(parsed.results[1]).toEqual({ kind: "other", confidence: 0 });
    expect(parsed.missing).toEqual([false, true, true]);
    expect(parsed.problems).toEqual([
      "duplicate tile 1",
      "out-of-range tile 7",
      "2 tile(s) missing",
    ]);
  });

  it("clamps confidence and tolerates no output", () => {
    const parsed = parseTileResults(
      { tiles: [{ index: 1, kind: "post-match", confidence: 1.7 }] },
      1,
    );
    expect(parsed.results[0].confidence).toBe(1);
    expect(parseTileResults(undefined, 2).missing).toEqual([true, true]);
  });
});

describe("toVerdict", () => {
  it("only confirms post-match at or above the threshold", () => {
    expect(toVerdict({ kind: "post-match", confidence: 0.6 }, 0.6).isScoreboard).toBe(true);
    expect(toVerdict({ kind: "post-match", confidence: 0.59 }, 0.6).isScoreboard).toBe(false);
    expect(
      toVerdict({ kind: "in-match-scoreboard", confidence: 0.99 }, 0.6).isScoreboard,
    ).toBe(false);
    expect(toVerdict({ kind: "post-match", confidence: 0.8 }, 0.6).evidence).toEqual([
      "post-match@0.80",
    ]);
  });
});

describe("buildDetectPrompt", () => {
  it("includes the profile's description, rejects and tile count", () => {
    const prompt = buildDetectPrompt(rocketLeague, 9);
    expect(prompt).toContain(rocketLeague.ai.description);
    expect(prompt).toContain(rocketLeague.ai.reject);
    expect(prompt).toContain("indices 1-9");
  });
});

describe("createAiClassifier", () => {
  let dir: string;
  let frames: FrameRecord[];

  beforeEach(async () => {
    vi.clearAllMocks();
    dir = mkdtempSync(join(tmpdir(), "ai-classifier-"));
    frames = await Promise.all(
      [1, 2, 3].map(async (frameId) => {
        const filePath = join(dir, `${frameId}.jpg`);
        await sharp({
          create: { width: 160, height: 90, channels: 3, background: { r: frameId * 60, g: 0, b: 0 } },
        })
          .jpeg()
          .toFile(filePath);
        return { frameId, filePath, timestampSec: frameId - 1 };
      }),
    );
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  const make = () =>
    createAiClassifier({
      profile: rocketLeague,
      modelSpec: "google:gemini-2.5-flash",
      grid: 2,
      minConfidence: 0.6,
      cachePath: join(dir, "detections.jsonl"),
      sheetWidth: 320,
    });

  it("sends one contact sheet per batch and reuses cached tiles on a re-run", async () => {
    generateTextMock.mockResolvedValue({
      output: {
        tiles: [
          { index: 1, kind: "other", confidence: 0.9 },
          { index: 2, kind: "post-match", confidence: 0.95 },
          { index: 3, kind: "in-match-scoreboard", confidence: 0.9 },
        ],
      },
    });

    const classifier = make();
    expect(classifier.batchSize).toBe(4);
    const verdicts = await classifier.classify(frames);
    expect(verdicts.map((v) => v.isScoreboard)).toEqual([false, true, false]);

    const call = generateTextMock.mock.calls[0][0];
    const image = call.messages[0].content.find(
      (part: { type: string }) => part.type === "file",
    );
    expect(image.mediaType).toBe("image/jpeg");
    expect(Buffer.isBuffer(image.data)).toBe(true);

    const rerun = make();
    const cached = await rerun.classify(frames);
    expect(cached.map((v) => v.isScoreboard)).toEqual([false, true, false]);
    expect(generateTextMock).toHaveBeenCalledTimes(1);
  });

  it("only sends uncached frames, and doesn't cache tiles the model skipped", async () => {
    generateTextMock.mockResolvedValueOnce({
      output: { tiles: [{ index: 1, kind: "post-match", confidence: 0.9 }] },
    });
    await make().classify(frames.slice(0, 2));

    generateTextMock.mockResolvedValueOnce({
      output: {
        tiles: [
          { index: 1, kind: "other", confidence: 0.9 },
          { index: 2, kind: "other", confidence: 0.9 },
        ],
      },
    });
    const verdicts = await make().classify(frames);

    // Frame 1 was cached; frame 2 was missing from the first answer, so it
    // and frame 3 go out on a 2-tile sheet.
    expect(generateTextMock.mock.calls[1][0].messages[0].content[0].text).toContain(
      "indices 1-2",
    );
    expect(verdicts.map((v) => v.isScoreboard)).toEqual([true, false, false]);
  });

  it("rejects an unknown provider prefix up front", () => {
    expect(() =>
      createAiClassifier({
        profile: rocketLeague,
        modelSpec: "nope:model",
        grid: 1,
        minConfidence: 0.6,
        cachePath: join(dir, "detections.jsonl"),
      }),
    ).toThrow();
  });
});
