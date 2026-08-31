import { test, expect } from "@playwright/test";
import { instant } from "@next/playwright";

/** Suite origin; keeps initial-load `instant()` aligned with Playwright `baseURL`. */
const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";

/** Known seeded game slug from generateStaticParams / production data. */
const GAME_FIXTURE_PATH = "/games/mariokart8";

/** Known seeded member slug from generateStaticParams / production data. */
const MEMBER_FIXTURE_PATH = "/members/mark";

/**
 * Soft-navigation instant() guards for public routes.
 * Run via `npm run test:instant` (see instant-nav.rig.md).
 */
test.describe("instant nav: public soft navigations", () => {
  test.describe.configure({ retries: 0 });

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
      await expect(page.getByTestId("games-content")).toHaveCount(0);
    });
    await expect(page.getByTestId("games-content")).toBeVisible();
  });

  test("Members shell commits under instant()", async ({ page }) => {
    await page.goto("/");
    const trigger = page.getByTestId("home-members-link");
    await expect(trigger).toBeVisible({ timeout: 20000 });

    await instant(page, async () => {
      await trigger.click();
      await expect(page.getByTestId("members-shell-marker")).toBeVisible();
      await expect(page.getByTestId("members-content")).toHaveCount(0);
    });
    await expect(page.getByTestId("members-content")).toBeVisible();
  });

  test("Sign-in shell commits under instant()", async ({ page }) => {
    await instant(
      page,
      async () => {
        await page.goto("/signin");
        await expect(page.getByTestId("signin-shell-marker")).toBeVisible();
      },
      { baseURL: BASE_URL },
    );
  });

  test("Feedback shell commits under instant()", async ({ page }) => {
    await instant(
      page,
      async () => {
        await page.goto("/feedback");
        await expect(page.getByTestId("feedback-shell-marker")).toBeVisible();
      },
      { baseURL: BASE_URL },
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
        await expect(page.getByTestId("home-games-content")).toHaveCount(0);
      },
      { baseURL: BASE_URL },
    );
    // Initial-load: reload unlocked document to assert streamed content
    await page.reload();
    await expect(page.getByTestId("home-games-content")).toBeVisible();
  });

  test("Game detail shell commits under instant()", async ({ page }) => {
    await page.goto("/games");
    await expect(page.getByTestId("games-shell-marker")).toBeVisible({
      timeout: 20000,
    });
    const gameLink = page
      .getByTestId("games-content")
      .locator(`a[href="${GAME_FIXTURE_PATH}"]`);
    await expect(gameLink).toBeVisible({ timeout: 20000 });

    // Viewport entry triggers Partial Prefetch (hover is a no-op on mobile).
    await gameLink.scrollIntoViewIfNeeded();
    await gameLink.focus();
    await page.waitForTimeout(2000);

    await instant(page, async () => {
      await Promise.all([
        page.waitForURL(`**${GAME_FIXTURE_PATH}`, { timeout: 15000 }),
        gameLink.click(),
      ]);
      await expect(page.getByTestId("game-detail-shell-marker")).toBeVisible({
        timeout: 10000,
      });
      await expect(page.getByTestId("game-detail-content")).toHaveCount(0);
    });
    await expect(page.getByTestId("game-detail-content")).toBeVisible({
      timeout: 20000,
    });
  });

  test("Member detail shell commits under instant()", async ({ page }) => {
    await page.goto("/members");
    await expect(page.getByTestId("members-shell-marker")).toBeVisible({
      timeout: 20000,
    });
    // Prefer the grid link test id — `a[href=…]` can also match navbar items.
    const memberLink = page
      .getByTestId("members-content")
      .getByTestId("member-link-mark");
    await expect(memberLink).toBeVisible({ timeout: 20000 });

    // Viewport entry triggers Partial Prefetch (hover is a no-op on mobile).
    // Center in the viewport so the fixed Battle button cannot cover the tap.
    await memberLink.evaluate((el) =>
      el.scrollIntoView({ block: "center", inline: "nearest" }),
    );
    await memberLink.focus();
    await page.waitForTimeout(2000);

    await instant(page, async () => {
      await Promise.all([
        page.waitForURL(`**${MEMBER_FIXTURE_PATH}`, {
          timeout: 15000,
          waitUntil: "commit",
        }),
        memberLink.click(),
      ]);
      await expect(page.getByTestId("member-detail-shell-marker")).toBeVisible({
        timeout: 10000,
      });
      await expect(page.getByTestId("member-detail-content")).toHaveCount(0);
    });
    await expect(page.getByTestId("member-detail-content")).toBeVisible({
      timeout: 20000,
    });
  });
});
