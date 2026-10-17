import { describe, expect, it } from "vitest";
import { VisionResultCodes } from "@/lib/constants";
import type { MatchManifest } from "../types";
import {
  cleanOrder,
  clusterTimes,
  fillPlaces,
  inferLobby,
  newestHit,
  refineMarioKartReads,
  safetyWindows,
} from "./mario-kart";

describe("mario kart finder", () => {
  it("opens a safety window when a race ends with no results list nearby", () => {
    const samples = [
      { t: 10, panel: 0.1, racing: 0.9 },
      { t: 14, panel: 0.1, racing: 0.2 },
    ];
    expect(safetyWindows(samples, [])).toEqual([[-5, 29]]);
    expect(safetyWindows(samples, [12])).toEqual([]);
  });

  it("clusters hits within 20 seconds into one race", () => {
    expect(clusterTimes([10, 30, 48, 90])).toEqual([[10, 30, 48], [90]]);
  });

  it("fills the one hidden place and leaves a complete order alone", () => {
    expect(fillPlaces({ 1: "2", 2: "1", 3: "?", 4: "4" }, [1, 2, 3, 4])).toEqual({
      placed: { 1: "2", 2: "1", 3: "3", 4: "4" },
      filled: true,
    });
    expect(fillPlaces({ 2: "1", 3: "2", 4: "3", 5: "4" }, [2, 3, 4, 5]).filled).toBe(false);
    expect(cleanOrder({ 1: "2", 2: "1" })).toBe(true);
    expect(cleanOrder({ 1: "1", 2: "1" })).toBe(false);
  });

  it("infers the roster the reads agree on", () => {
    expect(
      inferLobby([
        { 2: "1", 3: "2", 4: "3", 5: "4" },
        { 2: "4", 3: "1", 4: "2", 5: "3" },
        { 1: "1", 2: "2", 3: "3", 4: "4", 5: "5" },
      ]),
    ).toEqual([2, 3, 4, 5]);
  });

  it("writes an inferred place onto the match and does not invent a fifth racer", () => {
    const match = manifest({
      2: "1",
      3: "2",
      4: "?",
      5: "4",
    });
    const [filled] = refineMarioKartReads(
      [match, manifest({ 2: "2", 3: "1", 4: "3", 5: "4" })],
      [],
    );
    expect(filled.analysis?.status).toBe(VisionResultCodes.CheckRequest);
    if (filled.analysis?.status === VisionResultCodes.Failed) throw new Error("filled");
    const places = Object.fromEntries(
      filled.analysis!.data.players.map((player) => [
        player.playerId,
        player.stats.find((stat) => stat.stat === "MK8_POS")?.statValue,
      ]),
    );
    expect(places).toEqual({ 2: "1", 3: "2", 4: "3", 5: "4" });
    expect(refineMarioKartReads([filled], [])[0].analysis?.message).toBe(filled.analysis?.message);
  });

  it("stops at the newest hit and does not ask older frames", async () => {
    const asked: number[] = [];
    const frames = [0, 1, 2, 3, 4, 5, 6, 7, 8];
    const result = await newestHit(frames, 3, 1, async (frame) => {
      asked.push(frame);
      return frame === 8;
    });
    expect(result).toBe(8);
    expect(asked).toEqual([8]);
  });

  it("keeps the newest hit when an older frame answers first", async () => {
    const frames = [0, 1, 2, 3, 4, 5, 6, 7, 8];
    const result = await newestHit(frames, 3, 2, async (frame) => {
      await new Promise((resolve) => setTimeout(resolve, frame === 8 ? 30 : 1));
      return frame === 8 || frame === 5;
    });
    expect(result).toBe(8);
  });
});

function manifest(places: Record<number, string>): MatchManifest {
  return {
    match: 1,
    timestampSec: 0,
    timestampStr: "00:00:00",
    runLengthFrames: 1,
    imagePath: "match.png",
    ocrKeywords: [],
    analysis: {
      status: VisionResultCodes.Success,
      message: "ok",
      data: {
        players: Object.entries(places).map(([id, place]) => ({
          playerId: Number(id),
          name: "Mark",
          stats: [{ statId: 1, stat: "MK8_POS", statValue: place }],
        })),
      },
    },
  };
}
