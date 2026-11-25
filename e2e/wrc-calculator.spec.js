import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/index.html#EMPIRICAL');
  await page.evaluate(() => localStorage.clear());
  await page.goto('/index.html#EMPIRICAL');
});

test('Empirical tab opens on the WRC 537 calculator and reproduces the γ = 5 hand calc', async ({ page }) => {
  const calc = page.locator('[data-empirical-subview="WRC"]');
  await expect(calc).toBeVisible();
  await calc.locator('[data-act="example"]').selectOption('GAMMA5_ORACLE');
  await expect(calc.locator('.wrc__gov strong')).toHaveText('72.67 MPa');
  await expect(calc.locator('.wrc__gov b')).toHaveText('Au');
  await expect(calc.locator('.wrc__tier')).toContainText('source-qualified');
});

test('interpolated γ is calculated and labelled; out-of-range γ is explained', async ({ page }) => {
  const calc = page.locator('[data-empirical-subview="WRC"]');
  await calc.locator('[data-act="example"]').selectOption('CAESAR_GAMMA48');
  await expect(calc.locator('.wrc__tier')).toContainText('Interpolated γ');
  await expect(calc.locator('.wrc__gov b')).toHaveText('Du');

  await calc.locator('[data-k="shellThickness"]').fill('2');
  await expect(calc.locator('.wrc__tier')).toHaveText('Not calculated');
  await expect(calc.locator('.wrc__reasons')).toContainText('too thin');
});

test('inputs survive reload and the advanced EMP.1 workflow still mounts', async ({ page }) => {
  const calc = page.locator('[data-empirical-subview="WRC"]');
  await calc.locator('[data-k="attachmentOutsideDiameter"]').fill('250');
  await page.reload();
  await expect(page.locator('[data-empirical-subview="WRC"] [data-k="attachmentOutsideDiameter"]')).toHaveValue('250');

  await page.locator('[data-empirical-nav="WORKFLOW"]').click();
  await expect(page.locator('[data-empirical-subview="WORKFLOW"]')).toContainText('EMP.1');
});

test('load cases, pressure and the allowables check', async ({ page }) => {
  const calc = page.locator('[data-empirical-subview="WRC"]');
  await calc.locator('[data-act="example"]').selectOption('GAMMA5_ORACLE');
  await expect(calc.locator('[data-slot="check"]')).toBeEmpty();

  await calc.locator('[data-k="allowableS"]').fill('40');
  await expect(calc.locator('.wrc__check')).toContainText('PL + Pb + Q');
  await expect(calc.locator('[data-slot="check"] h3')).toContainText('PASS');
  await calc.locator('[data-k="bendingClass"]').selectOption('PB');
  await expect(calc.locator('[data-slot="check"] h3')).toContainText('FAIL');

  await calc.locator('[data-act="addCase"]').click();
  await calc.locator('[data-casename]').fill('Halved');
  for (const key of ['P', 'Vc', 'Vl', 'Mc', 'Ml', 'Mt']) {
    const input = calc.locator(`[data-load="${key}"]`);
    await input.fill(String(Number(await input.inputValue()) / 2));
  }
  await expect(calc.locator('.wrc__envelope tbody tr')).toHaveCount(2);
  await expect(calc.locator('.wrc__envelope tr.is-gov td').first()).toHaveText('Case 1');
  await expect(calc.locator('.wrc__gov strong')).toHaveText('36.34 MPa');

  await calc.locator('[data-k="designPressure"]').fill('1');
  await expect(calc.locator('.wrc__notes')).toContainText('not part of WRC 537');

  await page.reload();
  await expect(page.locator('.wrc__envelope tbody tr')).toHaveCount(2);
});
