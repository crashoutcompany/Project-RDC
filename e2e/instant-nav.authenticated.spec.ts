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

  test("Admin shell commits on initial load under instant()", async ({
    page,
  }) => {
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
