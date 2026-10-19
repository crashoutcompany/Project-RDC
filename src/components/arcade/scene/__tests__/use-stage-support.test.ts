import { describe, expect, it } from "vitest";
import { classifyStage, type StageSignals } from "../use-stage-support";

/** A capable desktop with a real GPU. */
const desktop: StageSignals = {
  param: null,
  reducedMotion: false,
  saveData: false,
  effectiveType: "4g",
  deviceMemory: 8,
  cores: 8,
  coarsePointer: false,
  screenShortSide: 900,
  renderer: "ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0)",
};

const mode = (overrides: Partial<StageSignals>) =>
  classifyStage({ ...desktop, ...overrides }).mode;

describe("classifyStage", () => {
  it("auto-starts on a capable desktop with high-performance GPU", () => {
    expect(classifyStage(desktop)).toEqual({
      mode: "auto",
      desktop: true,
      reducedMotion: false,
    });
  });

  it("waits for a tap on phones (coarse pointer + short screen side)", () => {
    expect(mode({ coarsePointer: true, screenShortSide: 390 })).toBe("tap");
    expect(classifyStage({ ...desktop, coarsePointer: true }).desktop).toBe(
      false,
    );
  });

  it("treats a phone held sideways (wider than 768px) as a phone", () => {
    // The short side is what matters, whatever the current width.
    expect(mode({ coarsePointer: true, screenShortSide: 412 })).toBe("tap");
  });

  it("still auto-starts on a tablet but in low power", () => {
    const tablet = classifyStage({
      ...desktop,
      coarsePointer: true,
      screenShortSide: 820,
    });
    expect(tablet).toMatchObject({ mode: "auto", desktop: false });
  });

  it.each([
    "Google SwiftShader",
    "ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)",
    "llvmpipe (LLVM 15.0.6, 128 bits)",
    "Mesa OffScreen Software Rasterizer",
    "Apple GPU (Software)",
  ])("treats the software renderer %s as tap-to-start", (renderer) => {
    expect(mode({ renderer })).toBe("tap");
  });

  it.each<[string, Partial<StageSignals>]>([
    ["reduced motion", { reducedMotion: true }],
    ["Data Saver", { saveData: true }],
    ["3G", { effectiveType: "3g" }],
    ["slow 2G", { effectiveType: "slow-2g" }],
    ["low memory", { deviceMemory: 2 }],
    [
      "4 cores on a touch device",
      { cores: 4, coarsePointer: true, screenShortSide: 820 },
    ],
    ["4 cores and low memory", { cores: 4, deviceMemory: 2 }],
  ])("waits for a tap with %s", (_, overrides) => {
    expect(mode(overrides)).toBe("tap");
  });

  it("auto-starts on a capable quad-core desktop", () => {
    expect(mode({ cores: 4 })).toBe("auto");
  });

  it("shows only the poster without WebGL", () => {
    expect(mode({ renderer: null })).toBe("none");
  });

  it("honours ?stage= overrides", () => {
    expect(mode({ param: "off" })).toBe("none");
    expect(
      mode({ param: "on", coarsePointer: true, screenShortSide: 390 }),
    ).toBe("auto");
    expect(mode({ param: "tap" })).toBe("tap");
  });
});
