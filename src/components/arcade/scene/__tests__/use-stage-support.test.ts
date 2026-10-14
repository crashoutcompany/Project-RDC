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
  viewportWidth: 1440,
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

  it("waits for a tap on phones (coarse pointer + narrow viewport)", () => {
    expect(mode({ coarsePointer: true, viewportWidth: 390 })).toBe("tap");
    expect(classifyStage({ ...desktop, coarsePointer: true }).desktop).toBe(
      false,
    );
  });

  it("still auto-starts on a wide touch device (tablet) but in low power", () => {
    const tablet = classifyStage({
      ...desktop,
      coarsePointer: true,
      viewportWidth: 1024,
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
    ["4 cores", { cores: 4 }],
  ])("waits for a tap with %s", (_, overrides) => {
    expect(mode(overrides)).toBe("tap");
  });

  it("shows only the poster without WebGL", () => {
    expect(mode({ renderer: null })).toBe("none");
  });

  it("honours ?stage= overrides", () => {
    expect(mode({ param: "off" })).toBe("none");
    expect(mode({ param: "on", coarsePointer: true, viewportWidth: 390 })).toBe(
      "auto",
    );
    expect(mode({ param: "tap" })).toBe("tap");
  });
});
