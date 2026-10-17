import { test, expect } from "@playwright/test";
import { instant } from "@next/playwright";

/** Known seeded game slug from generateStaticParams / production data. */
const GAME_FIXTURE_PATH = "/games/mariokart8";

test.describe("session pages", () => {
  test.describe.configure({ retries: 0 });

  test("opens a session from the game page under instant()", async ({
    page,
  }) => {
    await page.goto(GAME_FIXTURE_PATH);
    // Selecting a replay tape loads it into the viewer, which holds the link.
    const tape = page.locator("button:has(img)").first();
    await expect(tape).toBeVisible({ timeout: 20000 });
    await tape.click();

    const link = page.getByRole("link", { name: /Session page/ });
    await expect(link).toBeVisible();

    await instant(page, async () => {
      await link.click();
      await expect(
        page.getByTestId("session-detail-shell-marker"),
      ).toBeVisible();
    });
    await expect(page).toHaveURL(/\/sessions\/\d+$/);
    await expect(page.getByTestId("session-detail-content")).toBeVisible();
    await expect(page.locator("iframe[title]")).toHaveAttribute(
      "src",
      /youtube-nocookie\.com\/embed\//,
    );
  });

  // notFound() fires inside the streamed Suspense boundary, after the 200 shell
  // is sent, so this is a soft 404: noindex + not-found UI, not a 404 status.
  test("unknown session id renders not-found and noindex", async ({ page }) => {
    await page.goto("/sessions/999999999");
    await expect(page.locator('head meta[name="robots"]')).toHaveAttribute(
      "content",
      /noindex/,
    );
    await expect(page.getByTestId("session-detail-content")).toHaveCount(0);
  });
});
