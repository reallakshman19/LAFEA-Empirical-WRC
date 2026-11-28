import { expect, test } from '@playwright/test';

// Canvas step A2 (roadmap stage A): one shell with several attachments, above the calculator form.

test.beforeEach(async ({ page }) => {
  await page.goto('/index.html#EMPIRICAL');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test('several attachments on one shell: pick, edit, add, delete, and the table of all of them', async ({ page }) => {
  const calc = page.locator('[data-empirical-subview="WRC"]');
  const atts = calc.locator('.wrc__atts');
  // A fresh start: one attachment, no table.
  await expect(atts.locator('[data-attachment]')).toHaveCount(1);
  await expect(calc.locator('.wrc__vessel')).toHaveCount(0);
  // The canvas sits above the form.
  const canvasBox = await calc.locator('.wrc__canvas').boundingBox();
  const formBox = await calc.locator('.wrc__inputs').boundingBox();
  expect(canvasBox.y + canvasBox.height).toBeLessThanOrEqual(formBox.y);

  await calc.locator('[data-act="example"]').selectOption('VESSEL:TWO_NOZZLES_LUG');
  await expect(atts.locator('[data-attachment]')).toHaveText([/^N1/u, /^N2/u, /^L1/u]);
  const rows = calc.locator('.wrc__vessel tbody tr');
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0)).toContainText('69.49');
  await expect(rows.nth(2)).toContainText('lug 200 × 100 mm');
  await expect(rows.nth(2)).toHaveClass(/is-gov/u);
  await expect(calc.locator('.wrc__vessel caption')).toContainText('Highest: L1');
  await expect(calc.locator('.wrc__gov strong')).toHaveText('69.49 MPa'); // N1 selected

  // Pick N2 from the table: the form shows N2, the sketch highlights it with its angle.
  await rows.nth(1).getByRole('button', { name: 'N2' }).click();
  await expect(calc.locator('[data-k="attachmentName"]')).toHaveValue('N2');
  await expect(calc.locator('[data-k="attachmentAngle"]')).toHaveValue('90');
  await expect(calc.locator('.wrc__vessel button[data-attachment="1"]')).toBeFocused();
  await expect(calc.locator('svg[data-view="end"] [data-dim="90°"]')).toHaveCount(1);
  await expect(calc.locator('svg[data-view="side"]')).toHaveAttribute('aria-label', /3 attachments on this shell; selected N2/u);

  // A shell input is shared; an attachment input stays with its attachment.
  await calc.locator('[data-k="shellThickness"]').fill('14');
  await calc.locator('[data-k="attachmentOutsideDiameter"]').fill('200');
  await atts.locator('[data-attachment="0"]').click();
  await expect(calc.locator('[data-k="shellThickness"]')).toHaveValue('14');
  await expect(calc.locator('[data-k="attachmentOutsideDiameter"]')).toHaveValue('219.1');
  await expect(rows.nth(1)).toContainText('Ø200 mm');

  // Add a copy a quarter turn round, rename it, then delete it.
  await calc.locator('[data-act="addAttachment"]').click();
  await expect(calc.locator('[data-k="attachmentName"]')).toBeFocused();
  await expect(calc.locator('[data-k="attachmentAngle"]')).toHaveValue('90');
  await calc.locator('[data-k="attachmentName"]').fill('N9');
  await expect(atts.locator('[data-attachment="3"]')).toContainText('N9');
  await calc.locator('[data-act="deleteAttachment"]').click();
  await expect(atts.locator('[data-attachment]')).toHaveCount(3);

  // Kept after a reload.
  await page.reload();
  await expect(page.locator('[data-empirical-subview="WRC"] .wrc__atts [data-attachment]')).toHaveCount(3);
  await expect(page.locator('[data-empirical-subview="WRC"] [data-k="shellThickness"]')).toHaveValue('14');
});

test('a vessel saves to a file and opens again; a case file from before opens as one attachment', async ({ page }) => {
  const calc = page.locator('[data-empirical-subview="WRC"]');
  await calc.locator('[data-act="example"]').selectOption('VESSEL:TWO_NOZZLES_LUG');
  const [download] = await Promise.all([page.waitForEvent('download'), calc.locator('[data-act="save"]').click()]);
  expect(download.suggestedFilename()).toBe('vessel-with-two-nozzles-and-a-lug.vessel.json');
  const saved = JSON.parse(await (await import('node:fs/promises')).readFile(await download.path(), 'utf8'));
  expect(saved.schema).toBe('lafea-emp-app/vessel/v1');
  expect(saved.vessel.attachments.map((a) => a.attachmentName)).toEqual(['N1', 'N2', 'L1']);

  await calc.locator('[data-act="example"]').selectOption('GAMMA5_ORACLE');
  await expect(calc.locator('.wrc__atts [data-attachment]')).toHaveCount(1);
  await calc.locator('[data-act="file"]').setInputFiles({ name: 'v.vessel.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(saved)) });
  await expect(calc.locator('.wrc__atts [data-attachment]')).toHaveCount(3);
  await expect(calc.locator('.wrc__vessel tbody tr')).toHaveCount(3);

  const oldCase = { schema: 'lafea-emp-app/wrc537-case/v1', case: { title: 'Old', shellOutsideDiameter: 220, shellThickness: 20, attachmentOutsideDiameter: 35.42857142857143, cylinderLength: 300, attachmentStation: 80, forceUnit: 'N', momentUnit: 'N·mm', loads: { P: -1000, Vc: 250, Vl: -400, Mc: 500000, Ml: -600000, Mt: 700000 } } };
  await calc.locator('[data-act="file"]').setInputFiles({ name: 'old.wrc.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(oldCase)) });
  await expect(calc.locator('.wrc__atts [data-attachment]')).toHaveCount(1);
  await expect(calc.locator('.wrc__gov strong')).toHaveText('72.67 MPa');
});
