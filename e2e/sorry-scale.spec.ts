import { test, expect } from "@playwright/test";

test.describe("sorry scale filters", () => {
  test("switches tabs on the client and mirrors them to the URL", async ({
    page,
  }) => {
    await page.goto("/members");
    const thirtyDays = page.getByRole("button", { name: "30 days" });
    const allGames = page.getByRole("button", { name: "All games" });
    await expect(allGames).toHaveAttribute("aria-pressed", "true");

    // Tabs switch locally: no RSC request should be made for the change.
    const rscRequests: string[] = [];
    page.on("request", (req) => {
      if (req.url().includes("_rsc=") && req.url().includes("sorryRange"))
        rscRequests.push(req.url());
    });

    await thirtyDays.click();
    await expect(thirtyDays).toHaveAttribute("aria-pressed", "true");
    await expect(page).toHaveURL(/sorryRange=30d/);
    await expect(page).toHaveURL(/sorryGame=all/);
    expect(rscRequests).toEqual([]);

    // The URL is shareable: a fresh load restores the same tab.
    await page.reload();
    await expect(page.getByRole("button", { name: "30 days" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  test("falls back to all games, all-time for unknown params", async ({
    page,
  }) => {
    await page.goto("/members?sorryGame=bogus&sorryRange=zzz");
    await expect(
      page.getByRole("button", { name: "All games" }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(
      page.getByRole("button", { name: "All-time" }),
    ).toHaveAttribute("aria-pressed", "true");
  });
});
