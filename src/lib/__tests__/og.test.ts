import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { publicImageDataUrl } from "../og";

describe("publicImageDataUrl", () => {
  it("reads a jpeg from public/ as a data URL", async () => {
    const url = await publicImageDataUrl("/images/mk8.jpg");
    expect(url?.startsWith("data:image/jpeg;base64,")).toBe(true);
  });

  it("refuses paths that escape public/", async () => {
    expect(await publicImageDataUrl("/../package.json")).toBeNull();
    expect(await publicImageDataUrl("/../../etc/passwd")).toBeNull();
  });

  it("returns null for formats Satori cannot draw or missing files", async () => {
    expect(
      await publicImageDataUrl("/images/arcade-room-poster.webp"),
    ).toBeNull();
    expect(await publicImageDataUrl("/images/does-not-exist.png")).toBeNull();
    expect(await publicImageDataUrl(undefined)).toBeNull();
    expect(await publicImageDataUrl("images/mk8.jpg")).toBeNull();
  });
});
