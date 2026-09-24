import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { installHint, which } from "./deps";

describe("which", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "which-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("finds an executable on a POSIX PATH and skips non-executables", () => {
    const a = join(dir, "a");
    const b = join(dir, "b");
    mkdirSync(a);
    mkdirSync(b);
    writeFileSync(join(a, "ffmpeg"), "");
    chmodSync(join(a, "ffmpeg"), 0o644);
    writeFileSync(join(b, "ffmpeg"), "");
    chmodSync(join(b, "ffmpeg"), 0o755);

    expect(which("ffmpeg", { PATH: `${a}:${b}` }, "linux")).toBe(join(b, "ffmpeg"));
    expect(which("yt-dlp", { PATH: `${a}:${b}` }, "linux")).toBeNull();
  });

  it("resolves PATHEXT suffixes on Windows", () => {
    writeFileSync(join(dir, "ffmpeg.EXE"), "");
    expect(
      which("ffmpeg", { Path: dir, PATHEXT: ".COM;.EXE" }, "win32"),
    ).toBe(join(dir, "ffmpeg.EXE"));
  });
});

describe("installHint", () => {
  it("tailors hints per platform", () => {
    expect(installHint("ffmpeg", "darwin")).toContain("brew");
    expect(installHint("ffmpeg", "linux")).toContain("dnf");
    expect(installHint("ffmpeg", "win32")).toContain("winget");
    expect(installHint("yt-dlp", "linux")).toContain("pipx");
  });
});
