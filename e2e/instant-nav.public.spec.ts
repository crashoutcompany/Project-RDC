import { test, expect, type Page } from "@playwright/test";
import { instant } from "@next/playwright";

/** Suite origin; keeps initial-load `instant()` aligned with Playwright `baseURL`. */
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";

/** Known seeded game slug from generateStaticParams / production data. */
const GAME_FIXTURE_PATH = "/games/mariokart8";

/** Known seeded member slug from generateStaticParams / production data. */
const MEMBER_FIXTURE_PATH = "/members/mark";

/**
 * Resolves once the router has prefetched the segment data for `pathname`
 * (the request after the `/_tree` route lookup). instant() only commits from
 * prefetched data, so clicking before this lands can hang the navigation.
 * Call before the link enters the viewport so the response isn't missed.
 *
 * Pass a RegExp for dynamic routes whose shell doesn't depend on the param:
 * Next shares that page segment across params, so only the first link of the
 * route (e.g. `/members/dylan`) fetches it and the rest reuse the cache.
 */
function waitForSegmentPrefetch(page: Page, pathname: string | RegExp) {
  return page
    .waitForResponse(
      (response) => {
        const request = response.request();
        return (
          (typeof pathname === "string"
            ? new URL(request.url()).pathname === pathname
            : pathname.test(new URL(request.url()).pathname)) &&
          request.headers()["next-router-prefetch"] !== undefined &&
          request.headers()["next-router-segment-prefetch"] !== "/_tree"
        );
      },
      { timeout: 20000 },
    )
    .then((response) => response.finished());
}

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
      },
      { baseURL: BASE_URL },
    );
    // Initial-load: reload the unlocked document and check what a visitor
    // sees: the room poster and both calls to action.
    await page.reload();
    await expect(page.locator('img[src*="arcade-room-poster"]')).toBeVisible();
    await expect(page.getByTestId("home-games-link")).toBeVisible();
    await expect(page.getByTestId("home-members-link")).toBeVisible();
  });

  test("Game detail shell commits under instant()", async ({ page }) => {
    const prefetched = waitForSegmentPrefetch(page, GAME_FIXTURE_PATH);
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
    await prefetched;

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
    const prefetched = waitForSegmentPrefetch(page, /^\/members\/[^/]+$/);
    await page.goto("/members");
    await expect(page.getByTestId("members-shell-marker")).toBeVisible({
      timeout: 20000,
    });
    // Prefer the grid link test id — `a[href=…]` can also match navbar items.
    const memberLink = page
      .getByTestId("members-content")
      .getByTestId("member-link-mark");
    await expect(memberLink).toBeVisible({ timeout: 20000 });
    await expect(memberLink).toHaveAttribute("href", MEMBER_FIXTURE_PATH);

    // Viewport entry triggers Partial Prefetch (hover is a no-op on mobile).
    // Center in the viewport so the fixed Battle button cannot cover the tap.
    await memberLink.evaluate((el) =>
      el.scrollIntoView({ block: "center", inline: "nearest" }),
    );
    await prefetched;
    await page.keyboard.press("Escape");

    await instant(page, async () => {
      await Promise.all([
        page.waitForURL(`**${MEMBER_FIXTURE_PATH}`, { timeout: 15000 }),
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
