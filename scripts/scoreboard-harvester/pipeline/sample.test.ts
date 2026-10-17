import { describe, expect, it } from "vitest";
import { keyframeExtractArgs, keyframeVf } from "./sample";

describe("keyframe extraction", () => {
  it("skips non-keyframes for av1 and h264", () => {
    expect(keyframeVf("av1", 640)).toEqual({ skipNonKey: true, vf: "showinfo,scale=640:-2" });
    expect(keyframeVf("h264", 640).skipNonKey).toBe(true);
    const args = keyframeExtractArgs({
      videoPath: "/v.mkv",
      framesDir: "/frames",
      sampleWidth: 640,
      jpegQuality: 3,
      codec: "av1",
    });
    expect(args).toContain("-skip_frame");
    expect(args).toContain("nokey");
  });

  it("selects I-frames for vp9, which ignores -skip_frame nokey", () => {
    const vp9 = keyframeVf("vp9", 640);
    expect(vp9.skipNonKey).toBe(false);
    expect(vp9.vf).toBe("select='eq(pict_type,I)',showinfo,scale=640:-2");
    const args = keyframeExtractArgs({
      videoPath: "/v.mkv",
      framesDir: "/frames",
      sampleWidth: 640,
      jpegQuality: 3,
      codec: "vp9",
    });
    expect(args).not.toContain("-skip_frame");
    expect(args).toContain(vp9.vf);
  });
});
