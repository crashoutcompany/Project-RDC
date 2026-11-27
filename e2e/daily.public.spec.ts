import { expect, test, type Page } from "@playwright/test";

/**
 * Happy path for the daily puzzle. The answer changes every day, so the test
 * plays it like a person: leader puzzles try members in order, count puzzles
 * binary-search with the higher/lower hints. Either way the game ends within
 * six guesses, survives a reload, and copies a spoiler-free share text.
 */
test.use({ permissions: ["clipboard-read", "clipboard-write"] });

const guesses = (page: Page) => page.getByTestId("daily-guess");

async function playOne(page: Page, kind: string, bounds: number[]) {
  if (kind === "leader") {
    await page
      .locator('[data-testid="daily-member-option"]:enabled')
      .first()
      .click();
    return;
  }
  const [low, high] = bounds;
  const guess = Math.floor((low + high) / 2);
  await page.getByTestId("daily-number-input").fill(String(guess));
  await page.getByTestId("daily-submit").click();
  const last = guesses(page).last();
  await expect(last).toContainText(String(guess));
  const text = (await last.textContent()) ?? "";
  if (text.includes("Higher")) bounds[0] = guess + 1;
  else if (text.includes("Lower")) bounds[1] = guess - 1;
}

test("play today's puzzle, reload, and share", async ({ page }) => {
  await page.goto("/daily");
  const game = page.getByTestId("daily-game");
  await expect(game).toBeVisible({ timeout: 20000 });
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.getByTestId("daily-remaining")).toHaveText("Guess 1 of 6");

  const kind = (await game.getAttribute("data-kind"))!;
  const heading = await page.getByRole("heading", { level: 1 }).textContent();

  // One guess, then a reload must keep it.
  const bounds = [0, 2000];
  await playOne(page, kind, bounds);
  await expect(guesses(page)).toHaveCount(1);
  await page.reload();
  await expect(guesses(page)).toHaveCount(1);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(heading!);

  const result = page.getByTestId("daily-result");
  for (let i = 1; i < 6 && !(await result.isVisible()); i++) {
    await playOne(page, kind, bounds);
    await expect(guesses(page)).toHaveCount(i + 1);
  }
  await expect(result).toBeVisible();
  const count = await guesses(page).count();
  expect(count).toBeLessThanOrEqual(6);

  const answer = await page
    .getByTestId("daily-answer")
    .locator("strong")
    .textContent();
  await page.getByTestId("daily-share").click();
  await expect(page.getByText("Copied!")).toBeVisible();
  const shared = await page.evaluate(() => navigator.clipboard.readText());

  const won = (await result.getAttribute("data-status")) === "won";
  expect(shared).toMatch(
    new RegExp(`^RDC Daily #\\d+ ${won ? count : "X"}/6\\n`),
  );
  expect(shared).toContain("rdcstats.com/daily");
  expect(shared).not.toContain(answer!);
  await expect(page.getByTestId("daily-stats")).toContainText("Played1");

  // Finished games stay finished after a reload.
  await page.reload();
  await expect(result).toBeVisible();
  await expect(guesses(page)).toHaveCount(count);
});
