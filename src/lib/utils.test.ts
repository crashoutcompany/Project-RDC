import { describe, expect, it } from "vitest";
import { formatSessionDate } from "@/lib/utils";

describe("formatSessionDate", () => {
  it("shows the Eastern day for an evening session that is the next day in UTC", () => {
    // 2026-07-04 22:30 EDT is 2026-07-05 02:30 UTC.
    const date = new Date("2026-07-05T02:30:00Z");
    expect(formatSessionDate(date)).toBe("Jul 4, 2026");
  });

  it("accepts ISO strings and formats the same way", () => {
    expect(formatSessionDate("2026-07-05T02:30:00Z")).toBe("Jul 4, 2026");
  });
});
