import { test, expect } from "@playwright/test";

/**
 * Home is a full-screen, non-scrolling arcade room. These guard the layout
 * lock: it must not leak onto other pages after a client-side navigation
 * (Next keeps Home mounted but hidden), and short screens must still reach
 * the calls to action.
 */
test.describe("home layout", () => {
  test("Members scrolls to the footer after navigating from Home", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.getByTestId("site-footer")).toBeHidden();

    await page.getByTestId("home-members-link").click();
    await expect(page).toHaveURL(/\/members$/);
    await expect(page.getByTestId("members-content")).toBeVisible({
      timeout: 20000,
    });

    const footer = page.getByTestId("site-footer");
    await footer.scrollIntoViewIfNeeded();
    await expect(footer).toBeInViewport();
  });

  test("short screens can reach the Home calls to action", async ({ page }) => {
    await page.setViewportSize({ width: 740, height: 360 });
    await page.goto("/");
    const members = page.getByTestId("home-members-link");
    await members.scrollIntoViewIfNeeded();
    await expect(members).toBeInViewport();
    await expect(page.getByTestId("home-games-link")).toBeVisible();
  });
});
