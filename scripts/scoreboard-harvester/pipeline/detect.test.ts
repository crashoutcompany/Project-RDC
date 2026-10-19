import type { FrameRecord } from "../types";
import { clusterConsecutive } from "./dedup";
import {
  detectFrames,
  selectCoarseFrames,
  selectRefineFrames,
  type FrameClassifier,
} from "./detect";

const makeFrames = (ids: number[]): FrameRecord[] =>
  ids.map((frameId) => ({
    frameId,
    filePath: `/frames/${frameId}.jpg`,
    timestampSec: frameId - 1,
  }));

const range = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => from + i);

/**
 * Fake classifier: frames in `scoreboardIds` are scoreboards. Resolves
 * batches in reverse order of submission when `shuffle` is set, to prove
 * results are still applied in frame order.
 */
const fakeClassifier = (
  scoreboardIds: Set<number>,
  { batchSize = 1, shuffle = false, failIds = new Set<number>() } = {},
) => {
  const seen: number[][] = [];
  let delay = 50;
  const classifier: FrameClassifier = {
    id: "ai",
    batchSize,
    classify: async (frames) => {
      seen.push(frames.map((f) => f.frameId));
      if (shuffle) await new Promise((r) => setTimeout(r, (delay = Math.max(0, delay - 10))));
      if (frames.some((f) => failIds.has(f.frameId))) throw new Error("boom");
      return frames.map((f) => ({
        isScoreboard: scoreboardIds.has(f.frameId),
        evidence: [scoreboardIds.has(f.frameId) ? "hit" : "miss"],
      }));
    },
    close: async () => {},
  };
  return { classifier, seen };
};

const opts = { dedupGapSec: 3, skipAheadSec: 0, concurrency: 1, label: "t" };

describe("detectFrames", () => {
  it("returns confirmed frames with the classifier's evidence as matched keywords", async () => {
    const { classifier } = fakeClassifier(new Set([3, 4]));
    const out = await detectFrames(makeFrames(range(1, 6)), classifier, opts);
    expect(out.map((r) => r.frameId)).toEqual([3, 4]);
    expect(out[0].matchedKeywords).toEqual(["hit"]);
  });

  it("skips ahead in timestamp space once a run ends", async () => {
    // Run at 3-4 ends when frame 8 (8 - 4 > dedupGapSec 3) is unconfirmed;
    // skip-ahead 10 → frames below 14 are never classified.
    const { classifier, seen } = fakeClassifier(new Set([3, 4, 12, 15]));
    const out = await detectFrames(makeFrames(range(1, 20)), classifier, {
      ...opts,
      skipAheadSec: 10,
    });
    expect(out.map((r) => r.frameId)).toEqual([3, 4, 15]);
    expect(seen.flat()).not.toContain(12);
    expect(seen.flat()).toContain(8);
  });

  it("ignores in-flight results that land under a new skip boundary", async () => {
    const { classifier, seen } = fakeClassifier(new Set([1, 7]), {
      shuffle: true,
    });
    const out = await detectFrames(makeFrames(range(1, 12)), classifier, {
      ...opts,
      skipAheadSec: 10,
      concurrency: 4,
    });
    // Frame 7 was already in flight (concurrency 4) when frame 5 ended the
    // run at 1 and set the boundary at 11, so its hit must be discarded.
    expect(seen.flat()).toContain(7);
    expect(seen.flat()).not.toContain(9);
    expect(out.map((r) => r.frameId)).toEqual([1]);
  });

  it("applies results in frame order even when batches resolve out of order", async () => {
    const hits = new Set([2, 3, 10, 11]);
    const sequential = await detectFrames(
      makeFrames(range(1, 30)),
      fakeClassifier(hits).classifier,
      { ...opts, skipAheadSec: 6 },
    );
    const concurrent = await detectFrames(
      makeFrames(range(1, 30)),
      fakeClassifier(hits, { shuffle: true, batchSize: 2 }).classifier,
      { ...opts, skipAheadSec: 6, concurrency: 3 },
    );
    expect(concurrent.map((r) => r.frameId)).toEqual(
      sequential.map((r) => r.frameId),
    );
  });

  it("batches frames and ignores the rest of a batch past a new boundary", async () => {
    // Batch [5..8]: frame 5 ends the run at 1 (5 - 1 > 3) and sets the
    // boundary at 1 + 10 = 11, so the hit on 7 in the same batch is ignored.
    const { classifier, seen } = fakeClassifier(new Set([1, 7, 12]), {
      batchSize: 4,
    });
    const out = await detectFrames(makeFrames(range(1, 12)), classifier, {
      ...opts,
      skipAheadSec: 10,
    });
    expect(seen[0]).toEqual([1, 2, 3, 4]);
    expect(seen[1]).toEqual([5, 6, 7, 8]);
    expect(out.map((r) => r.frameId)).toEqual([1, 12]);
  });

  it("treats a failed batch as unclassified and keeps going", async () => {
    const { classifier } = fakeClassifier(new Set([2, 6]), {
      failIds: new Set([2]),
    });
    const out = await detectFrames(makeFrames(range(1, 8)), classifier, opts);
    expect(out.map((r) => r.frameId)).toEqual([6]);
  });
});

describe("selectCoarseFrames", () => {
  it("keeps one frame per stride, going by timestamps rather than ids", () => {
    // Keyframe-style sampling: gaps of 2s and 5s.
    const frames = [0, 2, 4, 9, 11, 13, 20].map((timestampSec, i) => ({
      frameId: i + 1,
      filePath: `/frames/${i + 1}.jpg`,
      timestampSec,
    }));
    expect(selectCoarseFrames(frames, 4).map((f) => f.frameId)).toEqual([
      1, 3, 4, 6, 7,
    ]);
  });

  it("keeps everything without a stride", () => {
    const frames = makeFrames(range(1, 5));
    expect(selectCoarseFrames(frames, 0)).toEqual(frames);
  });
});

describe("selectRefineFrames", () => {
  it("picks the unclassified frames within one stride of each coarse run", () => {
    const all = makeFrames(range(1, 40));
    const coarse = all.filter((f) => (f.frameId - 1) % 4 === 0);
    const runs = clusterConsecutive(makeFrames([9, 13]), 12);
    const refine = selectRefineFrames(
      all,
      runs,
      4,
      new Set(coarse.map((f) => f.frameId)),
    );
    expect(refine.map((f) => f.frameId)).toEqual([
      6, 7, 8, 10, 11, 12, 14, 15, 16,
    ]);
  });

  it("returns nothing without a stride", () => {
    const all = makeFrames(range(1, 10));
    expect(selectRefineFrames(all, [makeFrames([3])], 0, new Set())).toEqual(
      [],
    );
  });
});
