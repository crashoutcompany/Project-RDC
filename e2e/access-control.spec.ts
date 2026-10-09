import { expect, test } from "@playwright/test";
import { TESTER_STORAGE_STATE } from "./global-setup";

/**
 * Who can reach what. The proxy gates /admin/* (role:admin) and bounces
 * signed-in users off /signin; pages under it enforce their own auth too.
 */
test.describe("access control: guest", () => {
  for (const path of ["/admin", "/admin/submissions"]) {
    test(`${path} redirects to sign-in`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(/\/signin$/);
      await expect(page.getByTestId("signin-shell-marker")).toBeVisible();
    });
  }

  test("/profile sends guests home", async ({ page }) => {
    await page.goto("/profile");
    await page.waitForURL((url) => url.pathname === "/", { timeout: 20000 });
    await expect(page.getByTestId("profile-content")).toHaveCount(0);
  });
});

test.describe("access control: admin", () => {
  test.skip(
    !process.env.TEST_AUTH_SECRET,
    "TEST_AUTH_SECRET is required for authenticated E2E",
  );
  test.use({ storageState: TESTER_STORAGE_STATE });

  test("/signin redirects a signed-in user home", async ({ page }) => {
    await page.goto("/signin");
    await expect(page).toHaveURL((url) => url.pathname === "/");
  });

  test("navbar admin link opens the session entry form", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("nav-admin-link").click();
    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByTestId("admin-content")).toBeVisible({
      timeout: 20000,
    });
  });

  test("submissions queue renders", async ({ page }) => {
    await page.goto("/admin/submissions");
    await expect(page.getByTestId("admin-submissions-content")).toBeVisible({
      timeout: 20000,
    });
  });

  test("profile renders for the signed-in user", async ({ page }) => {
    await page.goto("/profile");
    await expect(page.getByTestId("profile-content")).toBeVisible({
      timeout: 20000,
    });
  });
});
