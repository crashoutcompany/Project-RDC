import { expect, test } from "@playwright/test";
import { instant } from "@next/playwright";
import { TESTER_STORAGE_STATE } from "./global-setup";

const BASE_URL =
  process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";

test.describe("instant nav: authenticated admin", () => {
  test.skip(
    !process.env.TEST_AUTH_SECRET,
    "TEST_AUTH_SECRET is required for authenticated E2E",
  );
  test.use({ storageState: TESTER_STORAGE_STATE });

  test("session cookie reaches /admin before instant()", async ({ page }) => {
    await page.goto("/admin");
    await expect(page).not.toHaveURL(/\/signin/);
    await expect(page.getByTestId("admin-shell-marker")).toBeVisible({
      timeout: 20000,
    });
  });

  test("Admin shell commits on soft nav under instant()", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("nav-about-link")).toBeVisible({
      timeout: 20000,
    });

    await instant(
      page,
      async () => {
        await page.goto("/admin");
        await expect(page.getByTestId("admin-shell-marker")).toBeVisible();
        await expect(page.getByTestId("admin-content")).toHaveCount(0);
      },
      { baseURL: BASE_URL },
    );
  });
});
