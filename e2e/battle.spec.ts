import { expect, test } from "@playwright/test";

test.describe("battle mode", () => {
  test("renders a heading with both fighters", async ({ page }) => {
    await page.goto("/members/battle?a=mark&b=dylan");
    const heading = page.getByRole("heading", { level: 1 });
    await expect(heading).toContainText(/mark/i);
    await expect(heading).toContainText(/dylan/i);
  });

  test("invalid params render the picker state", async ({ page }) => {
    await page.goto("/members/battle?a=nobody&b=");
    await expect(page.getByTestId("battle-picker")).toBeVisible();
    await expect(
      page.getByRole("link", { name: /Back to fighter select/ }),
    ).toHaveAttribute("href", "/members");
  });
});
