import { test, expect, devices, type Response } from "@playwright/test";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const { defaultBrowserType, ...pixel } = devices["Pixel 7"];

test.use({
  ...pixel,
  // Software WebGL so headless CI has a context to probe; phones get the
  // tap-to-start button either way.
  launchOptions: {
    args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  },
});

/** Only the three.js chunk carries three's console prefixes. */
const THREE_MARKER = "THREE.WebGLRenderer";

test("phones load no three.js until Tap to start", async ({ page }) => {
  const threeChunks: string[] = [];
  const assets3d: string[] = [];
  const pending: Promise<void>[] = [];
  page.on("response", (response: Response) => {
    const url = new URL(response.url());
    if (/\.glb$|\/draco\//.test(url.pathname)) assets3d.push(url.pathname);
    if (response.request().resourceType() !== "script") return;
    pending.push(
      response
        .text()
        .then((body) => {
          if (body.includes(THREE_MARKER)) threeChunks.push(url.pathname);
        })
        .catch(() => {}),
    );
  });

  await page.goto("/");
  const tap = page.getByTestId("home-tap-to-start");
  await expect(tap).toBeVisible({ timeout: 20000 });

  // Give an auto-start (load + idle) every chance to happen first.
  await page.waitForLoadState("load");
  await page.waitForTimeout(3000);
  await Promise.all(pending);
  expect(threeChunks).toEqual([]);
  expect(assets3d).toEqual([]);

  await tap.click();
  await expect
    .poll(
      async () => {
        await Promise.all(pending);
        return threeChunks.length;
      },
      { timeout: 30000 },
    )
    .toBeGreaterThan(0);
});
