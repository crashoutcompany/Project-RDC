import { test, expect } from "@playwright/test";

/** Known seeded game slug from generateStaticParams / production data. */
const GAME_FIXTURE_PATH = "/games/mariokart8";

test.describe("recent form strip", () => {
  test("game page shows the crew's last sessions with day winners", async ({
    page,
  }) => {
    await page.goto(GAME_FIXTURE_PATH);
    const strip = page.getByTestId("recent-form-strip");
    await expect(strip).toBeVisible({ timeout: 20000 });
    await expect(strip.getByRole("heading", { name: /Recent form/ })).toBeVisible();

    const tiles = strip.getByTestId("recent-form-session");
    const count = await tiles.count();
    expect(count).toBeGreaterThan(0);
    expect(count).toBeLessThanOrEqual(5);
    await expect(tiles.first().getByRole("link")).toHaveAttribute(
      "href",
      /^\/sessions\/\d+$/,
    );
  });
});
