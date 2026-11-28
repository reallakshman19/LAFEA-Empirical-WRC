import { expect, test } from '@playwright/test';

// Canvas step A1 (roadmap stage A): a dimensioned sketch of the WRC calculator's inputs.

test.beforeEach(async ({ page }) => {
  await page.goto('/index.html#EMPIRICAL');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test('the sketch draws the inputs, follows typing and units, and can be folded away', async ({ page }) => {
  const calc = page.locator('[data-empirical-subview="WRC"]');
  const sketch = calc.locator('[data-role="vessel-sketch"]');
  await expect(sketch).toBeVisible();
  await expect(sketch.locator('svg[role="img"]')).toHaveCount(2);
  await expect(sketch.locator('svg[data-view="side"]')).toHaveAttribute('aria-label', /outside diameter 1000 mm and thickness 12 mm; nozzle of outside diameter 219\.1 mm, 1500 mm from one end of a 3000 mm cylinder\./u);
  // The default nozzle: its diameter in both views, its station and the cylinder length in the side view.
  await expect(sketch.locator('[data-dim="Ø219.1 mm"]')).toHaveCount(2);
  await expect(sketch.locator('[data-dim="1500 mm"]')).toHaveCount(1);
  await expect(sketch.locator('[data-dim="3000 mm"]')).toHaveCount(1);
  await expect(sketch.locator('[data-dim="Ø1000 mm"]')).toHaveCount(2);

  // Typing redraws it at once; the results are still there.
  await calc.locator('[data-k="attachmentOutsideDiameter"]').fill('300');
  await expect(sketch.locator('[data-dim="Ø300 mm"]')).toHaveCount(2);
  await expect(calc.locator('.wrc__gov strong')).toBeVisible();
  await calc.locator('[data-k="attachmentStation"]').fill('');
  await expect(calc.locator('.vsketch__caption')).toContainText('No attachment position given: it is drawn at mid-length.');

  // US units: the same sketch in inches.
  await calc.locator('[data-k="units"]').selectOption('US');
  await expect(sketch.locator('[data-dim="Ø39.37 in"]')).toHaveCount(2);
  await expect(sketch.locator('[data-dim="Ø11.81 in"]')).toHaveCount(2);

  // A lug: its length along the shell in the side view, its width around in the end section.
  await calc.locator('[data-k="units"]').selectOption('SI');
  await calc.locator('[data-act="example"]').selectOption('LUG_200X100');
  await expect(sketch.locator('svg[data-view="side"] [data-dim="200 mm"]')).toHaveCount(1);
  await expect(sketch.locator('svg[data-view="end"] [data-dim="100 mm"]')).toHaveCount(1);
  await expect(sketch.locator('svg[data-view="end"]')).toHaveAttribute('aria-label', /rectangular attachment 200 mm along by 100 mm around/u);

  // Folded away and back.
  await calc.locator('.wrc__sketch > summary').click();
  await expect(sketch).toBeHidden();
  await calc.locator('.wrc__sketch > summary').click();
  await expect(sketch).toBeVisible();
});

test('the sketch fits a phone screen without scrolling sideways', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.reload();
  const sketch = page.locator('[data-empirical-subview="WRC"] [data-role="vessel-sketch"]');
  await expect(sketch.locator('svg')).toHaveCount(2);
  for (const view of await sketch.locator('svg').all()) {
    const box = await view.boundingBox();
    expect(box.x + box.width).toBeLessThanOrEqual(375);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
});
