import { describe, expect, it } from "vitest";
import { formatSessionDate } from "@/lib/utils";

describe("formatSessionDate", () => {
  it("formats a date in the en-US short style", () => {
    expect(formatSessionDate(new Date("2025-06-23T12:00:00Z"))).toBe(
      "Jun 23, 2025",
    );
  });

  it("uses Eastern Time, so late-evening ET stays on the same day", () => {
    // 2025-06-24T02:00Z is 10:00 PM on Jun 23 in New York (EDT, UTC-4).
    expect(formatSessionDate(new Date("2025-06-24T02:00:00Z"))).toBe(
      "Jun 23, 2025",
    );
  });

  it("uses Eastern Time across the UTC midnight boundary in winter (EST)", () => {
    // 2025-01-15T04:59Z is still Jan 14 at 11:59 PM in New York (UTC-5).
    expect(formatSessionDate(new Date("2025-01-15T04:59:00Z"))).toBe(
      "Jan 14, 2025",
    );
  });

  it("accepts ISO strings as well as Date objects", () => {
    expect(formatSessionDate("2024-05-01T12:00:00Z")).toBe("May 1, 2024");
  });
});
