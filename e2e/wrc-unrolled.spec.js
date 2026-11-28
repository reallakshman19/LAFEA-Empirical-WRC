import { expect, test } from '@playwright/test';

// Canvas step A3 (roadmap stage A): move attachments on the unrolled shell, by mouse and by keyboard.

test.beforeEach(async ({ page }) => {
  await page.goto('/index.html#EMPIRICAL');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.locator('[data-empirical-subview="WRC"] [data-act="example"]').selectOption('VESSEL:TWO_NOZZLES_LUG');
});

/** Where a point on the shell (mm along, degrees around) is on the screen, from the drawing's own scale. */
async function screenOf(page, x, y) {
  return page.evaluate(([mm, deg]) => {
    const svg = document.querySelector('[data-view="unrolled"]');
    const plot = svg.querySelector('.vunroll__surface');
    const x0 = Number(plot.getAttribute('x'));
    const y0 = Number(plot.getAttribute('y'));
    const span = 4000; // the worked vessel's length
    const p = new DOMPoint(x0 + (mm * Number(plot.getAttribute('width'))) / span, y0 + (deg * Number(plot.getAttribute('height'))) / 360)
      .matrixTransform(svg.getScreenCTM());
    return { x: p.x, y: p.y };
  }, [x, y]);
}
/** Press on an attachment, move in steps to a point on the shell, and (unless told not to) let go. */
async function drag(page, index, to, { release = true, before } = {}) {
  await page.locator('[data-view="unrolled"]').scrollIntoViewIfNeeded();
  const box = await page.locator(`[data-move="${index}"] .vunroll__hit`).boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await before?.();
  // The grab point is the attachment's centre, so the centre lands where the pointer ends.
  const target = await screenOf(page, ...to);
  await page.mouse.move(target.x, target.y, { steps: 8 });
  if (release) await page.mouse.up();
}

test('drag an attachment: grid, lining up, Shift, Esc and snap off', async ({ page }) => {
  const calc = page.locator('[data-empirical-subview="WRC"]');
  const station = calc.locator('[data-k="attachmentStation"]');
  const angle = calc.locator('[data-k="attachmentAngle"]');
  const readout = calc.locator('[data-role="unrolled-readout"]');
  await expect(calc.locator('[data-view="unrolled"] [data-move]')).toHaveCount(3);

  // N2 dropped near 3210 mm, 137°: picked, and on the grid at 3200 mm, 135°.
  await drag(page, 1, [3210, 137]);
  await expect(calc.locator('[data-k="attachmentName"]')).toHaveValue('N2');
  await expect(station).toHaveValue('3200');
  await expect(angle).toHaveValue('135');
  await expect(calc.locator('.wrc__vessel tbody tr').nth(1)).toContainText('3200');
  await expect(calc.locator('.wrc__vessel tbody tr').nth(1)).toContainText('135°');
  await expect(calc.locator('svg[data-view="end"] [data-dim="135°"]')).toHaveCount(1); // the sketch follows
  await expect(calc.locator('[data-move="1"]')).toBeFocused();

  // L1 nudged off the grid with Shift and the arrow keys, to 3007 mm, 183°…
  await calc.locator('[data-move="2"]').focus();
  for (let k = 0; k < 7; k += 1) await page.keyboard.press('Shift+ArrowRight');
  for (let k = 0; k < 3; k += 1) await page.keyboard.press('Shift+ArrowDown');
  await expect(station).toHaveValue('3007');
  await expect(angle).toHaveValue('183');
  // …then N2 dragged close to it lines up with it on both axes.
  await drag(page, 1, [3012, 181], { release: false });
  await expect(readout).toContainText('along lined up with L1');
  await expect(readout).toContainText('around lined up with L1');
  await expect(calc.locator('.vunroll__guide.is-aligned')).toHaveCount(2);
  await page.mouse.up();
  await expect(station).toHaveValue('3007');
  await expect(angle).toHaveValue('183');

  // Shift holds it to one axis: moved mostly along, its angle stays.
  await drag(page, 1, [1530, 190], { before: () => page.keyboard.down('Shift') });
  await page.keyboard.up('Shift');
  await expect(station).toHaveValue('1500');
  await expect(angle).toHaveValue('183');

  // Esc while dragging puts it back.
  await drag(page, 1, [600, 300], { release: false });
  await expect(station).toHaveValue('600');
  await page.keyboard.press('Escape');
  await expect(station).toHaveValue('1500');
  await expect(angle).toHaveValue('183');
  await page.mouse.up();
  await expect(station).toHaveValue('1500');

  // Snap off: it lands where it is let go, to the millimetre and the degree.
  await calc.locator('[data-act="snapToggle"]').uncheck();
  await drag(page, 1, [2457, 97]);
  const free = Number(await station.inputValue());
  expect(Math.abs(free - 2457)).toBeLessThanOrEqual(25);
  expect(free % 100).not.toBe(0);
  expect(Math.abs(Number(await angle.inputValue()) - 97)).toBeLessThanOrEqual(2);
});

test('move with the keyboard: grid steps, small steps, across 0°, and kept after a reload', async ({ page }) => {
  const calc = page.locator('[data-empirical-subview="WRC"]');
  const station = calc.locator('[data-k="attachmentStation"]');
  const angle = calc.locator('[data-k="attachmentAngle"]');
  const n1 = calc.locator('[data-move="0"]');
  await expect(n1).toHaveAttribute('aria-label', /^N1: 1000 mm along, 0° around, selected\./u);
  await n1.focus();
  await page.keyboard.press('ArrowRight');
  await expect(station).toHaveValue('1100');
  await page.keyboard.press('ArrowUp'); // up past the top comes in at the bottom
  await expect(angle).toHaveValue('345');
  await page.keyboard.press('Shift+ArrowLeft');
  await expect(station).toHaveValue('1099');
  await expect(calc.locator('[data-move="0"]')).toBeFocused();
  await expect(calc.locator('[data-move="0"]')).toHaveAttribute('aria-label', /^N1: 1099 mm along, 345° around/u);
  await expect(calc.locator('[data-role="wrc-live"]')).toHaveText('N1: 1099 mm along, 345° around.');

  // Enter on another attachment picks it; the arrow keys then move that one.
  await page.keyboard.press('Tab');
  await expect(calc.locator('[data-move="1"]')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(calc.locator('[data-k="attachmentName"]')).toHaveValue('N2');
  await page.keyboard.press('ArrowLeft');
  await expect(station).toHaveValue('2300');

  // An attachment with no position along: up and down change its angle and leave it without one.
  await calc.locator('.wrc__atts [data-attachment="2"]').click();
  await station.fill('');
  await calc.locator('[data-move="2"]').focus();
  await page.keyboard.press('ArrowDown');
  await expect(angle).toHaveValue('195');
  await expect(station).toHaveValue('');
  await expect(calc.locator('[data-role="unrolled-readout"]')).toContainText('no position along yet');

  await page.reload();
  const rows = page.locator('[data-empirical-subview="WRC"] .wrc__vessel tbody tr');
  await expect(rows.nth(0)).toContainText('1099');
  await expect(rows.nth(0)).toContainText('345°');
  await expect(rows.nth(1)).toContainText('2300');
});
