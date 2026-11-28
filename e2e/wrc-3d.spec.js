import { expect, test } from '@playwright/test';

// Canvas step A6 (roadmap stage A): a 3-D preview of the vessel, view only, loaded only when opened.

test.beforeEach(async ({ page }) => {
  await page.goto('/index.html#EMPIRICAL');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

/** How many of a grid of canvas pixels differ from its corner (the background): 0 for a blank canvas. */
async function drawnPixels(page) {
  return page.evaluate(() => {
    const c = document.querySelector('[data-role="vessel-3d"]');
    const ctx = c.getContext('2d');
    const bg = ctx.getImageData(1, 1, 1, 1).data;
    let n = 0;
    for (let i = 1; i < 20; i += 1) for (let j = 1; j < 12; j += 1) {
      const d = ctx.getImageData(Math.floor((c.width * i) / 20), Math.floor((c.height * j) / 12), 1, 1).data;
      if (Math.abs(d[0] - bg[0]) + Math.abs(d[1] - bg[1]) + Math.abs(d[2] - bg[2]) > 30) n += 1;
    }
    return n;
  });
}

test('the 3-D preview loads when opened, draws the vessel, turns, zooms and follows the selection', async ({ page }) => {
  const requests = [];
  page.on('request', (r) => { if (/vessel-3d|software-3d/u.test(r.url())) requests.push(r.url()); });
  const calc = page.locator('[data-empirical-subview="WRC"]');
  await calc.locator('[data-act="example"]').selectOption('VESSEL:TWO_NOZZLES_LUG');
  const details = calc.locator('[data-role="preview3d"]');
  await expect(details).not.toHaveAttribute('open', /.*/u);
  expect(requests, 'not fetched until opened').toEqual([]);

  await details.locator('summary').click();
  const canvas = calc.locator('[data-role="vessel-3d"]');
  await expect(canvas).toBeVisible();
  expect(requests.length).toBeGreaterThan(0);
  await expect(canvas).toHaveAttribute('aria-label',
    '3-D preview: shell of outside diameter 1500 mm, 4000 mm long, with 3 attachments (N1, N2, L1); N1 selected. Turned 0°, tilted 25°.');
  expect(await drawnPixels(page)).toBeGreaterThan(40);

  // Keys turn and tilt it; Home and "Reset view" put it back.
  await canvas.focus();
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowUp');
  await expect(canvas).toHaveAttribute('aria-label', /Turned 15°, tilted 40°\.$/u);
  await page.keyboard.press('Home');
  await expect(canvas).toHaveAttribute('aria-label', /Turned 0°, tilted 25°\.$/u);
  // Dragging turns it.
  const box = await canvas.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 - 60, box.y + box.height / 2, { steps: 6 });
  await page.mouse.up();
  await expect(canvas).toHaveAttribute('aria-label', /Turned 30°, tilted 25°\.$/u);
  const before = await page.evaluate(() => document.querySelector('[data-role="vessel-3d"]').toDataURL());
  await calc.locator('[data-v3d="zoomIn"]').click();
  expect(await page.evaluate(() => document.querySelector('[data-role="vessel-3d"]').toDataURL())).not.toBe(before);
  await calc.locator('[data-v3d="reset"]').click();
  await expect(canvas).toHaveAttribute('aria-label', /Turned 0°, tilted 25°\.$/u);

  // It follows the selection and the inputs.
  await calc.locator('.wrc__atts [data-attachment="1"]').click();
  await expect(canvas).toHaveAttribute('aria-label', /N2 selected/u);
  await calc.locator('[data-k="shellOutsideDiameter"]').fill('1800');
  await expect(canvas).toHaveAttribute('aria-label', /outside diameter 1800 mm/u);

  // Closing and opening again does not fetch it again.
  const count = requests.length;
  await details.locator('summary').click();
  await details.locator('summary').click();
  await expect(canvas).toBeVisible();
  expect(requests.length).toBe(count);
});

test('the 3-D preview fits a phone screen', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  const calc = page.locator('[data-empirical-subview="WRC"]');
  await calc.locator('[data-act="example"]').selectOption('VESSEL:TWO_NOZZLES_LUG');
  await calc.locator('[data-role="preview3d"] summary').click();
  await expect(calc.locator('[data-role="vessel-3d"]')).toBeVisible();
  expect(await drawnPixels(page)).toBeGreaterThan(20);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
});
