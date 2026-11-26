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
  // Lazy-loaded on first open of the sub-tab.
  await expect(page.locator('[data-empirical-subview="WORKFLOW"]')).toContainText('EMP.1', { timeout: 60000 });
});

test('the WRC calculator loads without the LAFEA workbench, which loads on first use', async ({ page }) => {
  const controllerRequests = [];
  page.on('request', (request) => {
    if (/standalone-controller/.test(request.url())) controllerRequests.push(request.url());
  });
  await page.goto('/index.html#EMPIRICAL');
  const calc = page.locator('[data-empirical-subview="WRC"]');
  await calc.locator('[data-act="example"]').selectOption('GAMMA5_ORACLE');
  await expect(calc.locator('.wrc__gov strong')).toHaveText('72.67 MPa');
  expect(controllerRequests).toEqual([]);

  await page.locator('[data-app-nav="LAFEA"]').click();
  await page.evaluate(() => globalThis.LafeaEmpApp.whenReady('LAFEA'));
  await expect(page.locator('[data-role="lafea-example-bar"]')).toBeVisible();
  expect(controllerRequests.length).toBeGreaterThan(0);
});

test('a failed LAFEA load is explained and can be retried', async ({ page }) => {
  let block = true;
  await page.route(/standalone-controller/, (route) => (block ? route.abort() : route.continue()));
  await page.goto('/index.html#EMPIRICAL');
  await page.locator('[data-app-nav="LAFEA"]').click();
  const lafea = page.locator('[data-app-view="LAFEA"]');
  await expect(lafea.locator('[role="alert"]')).toContainText('Could not load LAFEA', { timeout: 30000 });
  // The WRC calculator is unaffected.
  await page.locator('[data-app-nav="EMPIRICAL"]').click();
  await expect(page.locator('[data-empirical-subview="WRC"]')).toBeVisible();

  block = false;
  await page.locator('[data-app-nav="LAFEA"]').click();
  await lafea.getByRole('button', { name: 'Try again' }).click();
  await expect(lafea.locator('[data-role="lafea-example-bar"]')).toBeVisible({ timeout: 60000 });
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

test('shell FE cross-check runs in the background and agrees on the governing point', async ({ page }) => {
  test.setTimeout(240000);
  const calc = page.locator('[data-empirical-subview="WRC"]');
  await calc.locator('[data-act="example"]').selectOption('CAESAR_GAMMA48');
  await calc.locator('[data-act="runFe"]').click();
  await expect(calc.locator('[data-act="runFe"]')).toBeDisabled();
  await expect(calc.locator('.wrc__fetable')).toBeVisible({ timeout: 200000 });
  await expect(calc.locator('.wrc__fetable caption')).toContainText('WRC 1.52 at Du, FE 2.13 at Du');
  await calc.locator('[data-load="Ml"]').fill('40000');
  await expect(calc.locator('[data-slot="feResult"]')).toContainText('Inputs have changed');
});
