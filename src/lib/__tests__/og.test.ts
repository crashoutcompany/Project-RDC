import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { publicImageDataUrl, remoteImageDataUrl } from "../og";

const PNG_HEAD = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const FIVE_MB = 5 * 1024 * 1024;
const THUMB = "https://i.ytimg.com/vi/abc/hqdefault.jpg";

describe("publicImageDataUrl", () => {
  it("reads a jpeg from public/ as a data URL", async () => {
    const url = await publicImageDataUrl("/images/mk8.jpg");
    expect(url?.startsWith("data:image/jpeg;base64,")).toBe(true);
  });

  it("detects the real type when the extension is wrong", async () => {
    // A PNG saved with a .jpg extension.
    const url = await publicImageDataUrl("/images/marvel_rvials.jpg");
    expect(url?.startsWith("data:image/png;base64,")).toBe(true);
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

describe("remoteImageDataUrl", () => {
  afterEach(() => vi.unstubAllGlobals());

  const stubFetch = (res: Response) => {
    const fetchMock = vi.fn(async () => res);
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  };

  it("refuses hosts outside the YouTube image allowlist without fetching", async () => {
    const fetchMock = stubFetch(new Response(new Uint8Array(PNG_HEAD)));
    expect(await remoteImageDataUrl("https://evil.example/a.png")).toBeNull();
    expect(
      await remoteImageDataUrl("https://i.ytimg.com.evil.example/a.png"),
    ).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses plain http even for a YouTube host", async () => {
    const fetchMock = stubFetch(new Response(new Uint8Array(PNG_HEAD)));
    expect(
      await remoteImageDataUrl("http://i.ytimg.com/vi/abc/hqdefault.jpg"),
    ).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses redirects and sends the timeout signal", async () => {
    const fetchMock = stubFetch(new Response(new Uint8Array(PNG_HEAD)));
    await remoteImageDataUrl(THUMB);
    expect(fetchMock).toHaveBeenCalledWith(
      THUMB,
      expect.objectContaining({ redirect: "error", signal: expect.anything() }),
    );
  });

  it("rejects a declared body over 5 MB", async () => {
    stubFetch(
      new Response(new Uint8Array(PNG_HEAD), {
        headers: { "content-length": String(FIVE_MB + 1) },
      }),
    );
    expect(await remoteImageDataUrl(THUMB)).toBeNull();
  });

  it("stops reading a streamed body that grows over 5 MB", async () => {
    const big = new Uint8Array(FIVE_MB + 1);
    big.set(PNG_HEAD);
    stubFetch(new Response(big));
    expect(await remoteImageDataUrl(THUMB)).toBeNull();
  });

  it("sniffs the type from the bytes, not the Content-Type", async () => {
    stubFetch(
      new Response(new Uint8Array(PNG_HEAD), {
        headers: { "content-type": "text/plain" },
      }),
    );
    const url = await remoteImageDataUrl(THUMB);
    expect(url?.startsWith("data:image/png;base64,")).toBe(true);
  });

  it("returns null for non-image bytes", async () => {
    stubFetch(new Response(new TextEncoder().encode("<html>nope</html>")));
    expect(await remoteImageDataUrl(THUMB)).toBeNull();
  });
});
