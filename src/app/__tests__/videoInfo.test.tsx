import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { toast } from "sonner";
import { VideoInfo } from "../(routes)/admin/_components/form/VideoInfo";

vi.mock("sonner", () => ({ toast: { warning: vi.fn() } }));

type Form = Parameters<typeof VideoInfo>[0]["form"];

const makeForm = (thumbnail: string) =>
  ({
    watch: (name: string) =>
      ({
        thumbnail,
        sessionName: "Night 1",
        date: new Date("2025-01-10T00:00:00Z"),
      })[name],
  }) as unknown as Form;

const decodedSrc = (img: HTMLElement) =>
  decodeURIComponent(img.getAttribute("src") ?? "");

describe("VideoInfo thumbnail fallback", () => {
  beforeEach(() => vi.clearAllMocks());

  it("swaps to the fallback once, keeps it across re-renders, and toasts once", () => {
    const form = makeForm("https://i.ytimg.com/vi/broken/hqdefault.jpg");
    const { rerender } = render(<VideoInfo form={form} />);

    const img = screen.getByAltText("RDC Youtube Video Thumbnail");
    expect(decodedSrc(img)).toContain("ytimg.com/vi/broken");

    fireEvent.error(img);
    rerender(<VideoInfo form={form} />);
    rerender(<VideoInfo form={form} />);

    const fallback = screen.getByAltText("Leland from RDC");
    expect(decodedSrc(fallback)).toContain("/images/leland_rdc.jpg");
    expect(toast.warning).toHaveBeenCalledTimes(1);

    // An error from the fallback itself must not toast again.
    fireEvent.error(fallback);
    expect(toast.warning).toHaveBeenCalledTimes(1);
  });

  it("retries with the real image when the thumbnail changes", () => {
    const { rerender } = render(
      <VideoInfo form={makeForm("https://i.ytimg.com/vi/broken/hqdefault.jpg")} />,
    );
    fireEvent.error(screen.getByAltText("RDC Youtube Video Thumbnail"));
    expect(screen.getByAltText("Leland from RDC")).toBeTruthy();

    rerender(
      <VideoInfo form={makeForm("https://i.ytimg.com/vi/good/hqdefault.jpg")} />,
    );
    const img = screen.getByAltText("RDC Youtube Video Thumbnail");
    expect(decodedSrc(img)).toContain("ytimg.com/vi/good");
  });
});
