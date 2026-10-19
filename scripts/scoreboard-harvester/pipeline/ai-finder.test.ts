import { vi } from "vitest";
import type { FrameClassifier } from "./detect";

const classifierMock = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("./classifiers/ai", () => ({
  createAiClassifier: (opts: unknown) => classifierMock.create(opts),
}));
vi.mock("@/lib/vision/models", () => ({
  getVisionModelSpec: () => "google:app-default",
}));

import { rocketLeague } from "../games/rocket-league";
import { marioKart8 } from "../games/mario-kart-8";
import type { FrameRecord, ResolvedConfig } from "../types";
import { findWithAi } from "./ai-finder";

const frames: FrameRecord[] = Array.from({ length: 60 }, (_, i) => ({
  frameId: i + 1,
  filePath: `/frames/${i + 1}.jpg`,
  timestampSec: i,
}));

const config = (ai: Partial<ResolvedConfig["ai"]> = {}) =>
  ({
    dedupGapSec: 20,
    skipAheadSec: 0,
    keepFrames: false,
    ai: { strideSec: 4, grid: 3, minConfidence: 0.6, refine: true, concurrency: 1, ...ai },
  }) as ResolvedConfig;

/** A classifier that calls frames in [from, to] seconds a scoreboard, and records what it was asked. */
const scoreboardBetween = (from: number, to: number) => {
  const asked: number[] = [];
  const classifier: FrameClassifier = {
    id: "ai",
    batchSize: 1,
    classify: async (batch) => {
      asked.push(...batch.map((f) => f.timestampSec));
      return batch.map((f) => ({
        isScoreboard: f.timestampSec >= from && f.timestampSec <= to,
        evidence: ["post-match@0.95"],
      }));
    },
    close: vi.fn(async () => {}),
  };
  classifierMock.create.mockReturnValue(classifier);
  return { classifier, asked };
};

describe("findWithAi", () => {
  it("classifies one frame per stride, then refines around the hits to find the whole run", async () => {
    const { classifier, asked } = scoreboardBetween(20, 29);

    const { confirmed } = await findWithAi({
      frames,
      profile: rocketLeague,
      config: config(),
      workDir: "/work",
    });

    expect(confirmed.map((f) => f.timestampSec)).toEqual([
      20, 21, 22, 23, 24, 25, 26, 27, 28, 29,
    ]);
    expect(confirmed[0].matchedKeywords).toEqual(["post-match@0.95"]);
    // Coarse pass: every 4th second. Refine: only frames within a stride of the run.
    expect(asked.filter((t) => t % 4 === 0)).toHaveLength(15);
    expect(asked.filter((t) => t % 4 !== 0).every((t) => t >= 16 && t <= 32)).toBe(true);
    expect(classifier.close).toHaveBeenCalledOnce();
  });

  it("skips the refine pass with --no-refine", async () => {
    scoreboardBetween(20, 29);
    const { confirmed } = await findWithAi({
      frames,
      profile: rocketLeague,
      config: config({ refine: false }),
      workDir: "/work",
    });
    expect(confirmed.map((f) => f.timestampSec)).toEqual([20, 24, 28]);
  });

  it("uses the configured model, else the env default, else the app default", async () => {
    scoreboardBetween(100, 100);
    const run = async (model?: string) => {
      classifierMock.create.mockClear();
      const result = await findWithAi({
        frames,
        profile: rocketLeague,
        config: config({ model }),
        workDir: "/work",
      });
      return result.model;
    };
    expect(await run("local:qwen")).toBe("local:qwen");
    vi.stubEnv("HARVEST_DETECT_MODEL", "azure:detector");
    expect(await run()).toBe("azure:detector");
    vi.stubEnv("HARVEST_DETECT_MODEL", "");
    expect(await run()).toBe("google:app-default");
    vi.unstubAllEnvs();
  });

  it("refuses a game profile without an ai block", async () => {
    await expect(
      findWithAi({ frames, profile: marioKart8, config: config(), workDir: "/work" }),
    ).rejects.toThrow(/needs an "ai" block/);
  });
});
