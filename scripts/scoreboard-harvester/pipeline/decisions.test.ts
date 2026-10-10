import fs from "fs";
import os from "os";
import path from "path";
import type OpenAI from "openai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FrameRecord } from "../types";
import { decideFrames } from "./decisions";

let dir: string;
let frames: FrameRecord[];

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "decisions-"));
  frames = Array.from({ length: 6 }, (_, i) => {
    const filePath = path.join(dir, `${i + 1}.jpg`);
    fs.writeFileSync(filePath, "jpeg");
    return { frameId: i + 1, filePath, timestampSec: i * 5 };
  });
  vi.spyOn(console, "log").mockImplementation(() => {});
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

const answer = (probability: number) => ({
  answers: [{ type: "predicate", probability }],
  usage: { input_tokens: 100, output_tokens: 0 },
});
const clientFrom = (create: (frameNo: number) => unknown) => {
  let n = 0;
  return { decisions: { create: vi.fn(async () => create(++n)) } } as unknown as OpenAI;
};
const run = (client: OpenAI) =>
  decideFrames(frames, "scoreboard?", { logPath: path.join(dir, "log.jsonl"), concurrency: 1, client });

describe("decideFrames", () => {
  it("answers every frame", async () => {
    const result = await run(clientFrom((n) => answer(n === 3 ? 0.9 : 0.1)));
    expect(result.abortReason).toBeNull();
    expect(result.unanswered).toEqual([]);
    expect(result.verdicts.map((v) => v.probability)).toEqual([0.1, 0.1, 0.9, 0.1, 0.1, 0.1]);
  });

  it("stops on a fatal error and hands back the frames it didn't answer", async () => {
    const result = await run(
      clientFrom((n) => {
        if (n === 3) throw Object.assign(new Error("quota"), { status: 429, code: "insufficient_quota" });
        return answer(0.1);
      }),
    );
    expect(result.abortReason).toBe("quota exhausted (429)");
    expect(result.unanswered.map((f) => f.frameId)).toEqual([3, 4, 5, 6]);
  });

  it("resumes from its log, asking only unanswered frames", async () => {
    await run(
      clientFrom((n) => {
        if (n === 2) throw Object.assign(new Error("bad key"), { status: 401 });
        return answer(0.1);
      }),
    );
    const client = clientFrom(() => answer(0.2));
    const result = await run(client);
    expect(client.decisions.create).toHaveBeenCalledTimes(5);
    expect(result.unanswered).toEqual([]);
  });
});
