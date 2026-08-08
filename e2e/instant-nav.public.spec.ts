import { test, expect } from "@playwright/test";
import { instant } from "@next/playwright";

/**
 * Soft-navigation instant() guards for public routes.
 * Run against a production build with EXPOSE_TESTING_API=1 (see instant-nav.rig.md).
 */
test.describe("instant nav: public soft navigations", () => {
  test("About shell commits under instant()", async ({ page }) => {
    await page.goto("/");
    const trigger = page.getByTestId("nav-about-link");
    await expect(trigger).toBeVisible({ timeout: 20000 });

    await instant(page, async () => {
      await trigger.click();
      await expect(page.getByTestId("about-shell-marker")).toBeVisible();
    });
  });

  test("Games shell commits under instant()", async ({ page }) => {
    await page.goto("/");
    const trigger = page.getByTestId("home-games-link");
    await expect(trigger).toBeVisible({ timeout: 20000 });

    await instant(page, async () => {
      await trigger.click();
      await expect(page.getByTestId("games-shell-marker")).toBeVisible();
    });
  });

  test("Members shell commits under instant()", async ({ page }) => {
    await page.goto("/");
    const trigger = page.getByTestId("home-members-link");
    await expect(trigger).toBeVisible({ timeout: 20000 });

    await instant(page, async () => {
      await trigger.click();
      await expect(page.getByTestId("members-shell-marker")).toBeVisible();
    });
  });

  test("Sign-in shell commits under instant()", async ({ page }) => {
    await page.goto("/");
    await instant(
      page,
      async () => {
        await page.goto("/signin");
        await expect(page.getByTestId("signin-shell-marker")).toBeVisible();
      },
      { baseURL: "http://localhost:3000" },
    );
  });

  test("Feedback shell commits under instant()", async ({ page }) => {
    await instant(
      page,
      async () => {
        await page.goto("/feedback");
        await expect(page.getByTestId("feedback-shell-marker")).toBeVisible();
      },
      { baseURL: "http://localhost:3000" },
    );
  });

  test("Home shell commits on initial load under instant()", async ({
    page,
  }) => {
    await instant(
      page,
      async () => {
        await page.goto("/");
        await expect(page.getByTestId("home-shell-marker")).toBeVisible();
      },
      { baseURL: "http://localhost:3000" },
    );
  });

  test("Game detail shell commits under instant()", async ({ page }) => {
    await page.goto("/games");
    await expect(page.getByTestId("games-shell-marker")).toBeVisible({
      timeout: 20000,
    });
    // Prefer a real game card link once content is present; fall back to known slug
    const gameLink = page.locator('a[href^="/games/"]').first();
    await expect(gameLink).toBeVisible({ timeout: 20000 });

    await instant(page, async () => {
      await gameLink.click();
      await expect(page.getByTestId("game-detail-shell-marker")).toBeVisible();
    });
  });

  test("Member detail shell commits under instant()", async ({ page }) => {
    await page.goto("/members");
    await expect(page.getByTestId("members-shell-marker")).toBeVisible({
      timeout: 20000,
    });
    const memberLink = page.locator('a[href^="/members/"]').first();
    await expect(memberLink).toBeVisible({ timeout: 20000 });

    await instant(page, async () => {
      await memberLink.click();
      await expect(
        page.getByTestId("member-detail-shell-marker"),
      ).toBeVisible();
    });
  });
});
