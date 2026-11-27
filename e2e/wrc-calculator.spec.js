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

test('a reinforcing pad is checked at the attachment and at the pad edge', async ({ page }) => {
  const calc = page.locator('[data-empirical-subview="WRC"]');
  await calc.locator('[data-act="example"]').selectOption('PAD_36IN');
  await expect(calc.locator('[data-slot="derived"] [data-location]')).toHaveCount(2);
  await expect(calc.locator('.wrc__points')).toHaveCount(2);
  await expect(calc.locator('.wrc__gov strong')).toHaveText('108.78 MPa');
  await expect(calc.locator('.wrc__gov b')).toHaveText('Cu');
  await expect(calc.locator('.wrc__gov')).toContainText('at the pad edge (shell only)');
  await expect(calc.locator('.wrc__notes')).toContainText('WRC 537 itself has no pad rule');
  await expect(calc.locator('[data-slot="feScope"]')).toContainText('checks the pad edge');

  const [download] = await Promise.all([page.waitForEvent('download'), calc.locator('[data-act="download"]').click()]);
  const report = await (await import('node:fs/promises')).readFile(await download.path(), 'utf8');
  expect(report).toContain('At the attachment (shell + pad)');
  expect(report).toContain('At the pad edge (shell only)');

  await calc.locator('[data-k="padThickness"]').fill('');
  await expect(calc.locator('.wrc__reasons')).toContainText('Pad thickness must be a positive number');
  await calc.locator('[data-k="padOutsideDiameter"]').fill('');
  await expect(calc.locator('.wrc__points')).toHaveCount(1);
  await expect(calc.locator('[data-slot="feScope"]')).toBeEmpty();
});

test('a trunnion is a round attachment with its own labels', async ({ page }) => {
  const calc = page.locator('[data-empirical-subview="WRC"]');
  await calc.locator('[data-act="example"]').selectOption('TRUNNION_10IN');
  await expect(calc.locator('[data-k="attachmentType"]')).toHaveValue('TRUNNION');
  await expect(calc.locator('[data-k="trunnionConstruction"]')).toBeVisible();
  await expect(calc.locator('[data-k="attachmentOutsideDiameter"]')).toBeVisible();
  await expect(calc.locator('[data-k="attachmentWidth"]')).toBeHidden();
  await expect(calc.locator('.wrc__gov strong')).toHaveText('89.14 MPa');
  await expect(calc.locator('.wrc__notes')).toContainText('no solid/hollow selector');
  await expect(calc.locator('[data-slot="notes"]')).toContainText('not in the trunnion or its weld');
  await expect(calc.locator('[data-act="runFe"]')).toBeEnabled();

  // The same diameter as a nozzle gives the same stress; the construction choice is hidden again.
  await calc.locator('[data-k="attachmentType"]').selectOption('ROUND');
  await expect(calc.locator('.wrc__gov strong')).toHaveText('89.14 MPa');
  await expect(calc.locator('[data-k="trunnionConstruction"]')).toBeHidden();
});

test('a rectangular lug is solved with a β for each term, and its limits are explained', async ({ page }) => {
  const calc = page.locator('[data-empirical-subview="WRC"]');
  await calc.locator('[data-act="example"]').selectOption('LUG_200X100');
  await expect(calc.locator('[data-k="attachmentType"]')).toHaveValue('RECTANGULAR');
  await expect(calc.locator('[data-k="attachmentOutsideDiameter"]')).toBeHidden();
  await expect(calc.locator('[data-k="attachmentWidth"]')).toBeVisible();
  await expect(calc.locator('.wrc__derived')).toContainText('β1/β2');
  await expect(calc.locator('.wrc__gov strong')).toHaveText('153.38 MPa');
  await expect(calc.locator('.wrc__gov b')).toHaveText('Au');
  await expect(calc.locator('.wrc__terms tbody tr')).toHaveCount(16);
  await expect(calc.locator('.wrc__spread')).toContainText('150.10–156.26 MPa');
  await expect(calc.locator('.wrc__spread--wide')).toHaveCount(0);
  await expect(calc.locator('.wrc__notes')).toContainText('gives each load and stress component its own β');
  await expect(calc.locator('[data-act="runFe"]')).toBeDisabled();
  await expect(calc.locator('[data-slot="feScope"]')).toContainText('round footprint only');

  await calc.locator('[data-load="Mt"]').fill('10');
  await expect(calc.locator('.wrc__reasons')).toContainText('no method for torsion');
  await calc.locator('[data-load="Mt"]').fill('0');
  await calc.locator('[data-k="attachmentWidth"]').fill('25');
  await expect(calc.locator('.wrc__reasons')).toContainText('outside 0.25–4');

  await calc.locator('[data-k="attachmentType"]').selectOption('ROUND');
  await expect(calc.locator('[data-k="attachmentOutsideDiameter"]')).toBeVisible();
  await expect(calc.locator('.wrc__terms')).toHaveCount(0);
});

test('shell FE cross-check runs in the background and agrees on the governing point', async ({ page }) => {
  test.setTimeout(240000);
  const calc = page.locator('[data-empirical-subview="WRC"]');
  await calc.locator('[data-act="example"]').selectOption('CAESAR_GAMMA48');
  await calc.locator('[data-act="runFe"]').click();
  await expect(calc.locator('[data-act="runFe"]')).toBeDisabled();
  await expect(calc.locator('.wrc__fetable')).toBeVisible({ timeout: 200000 });
  // All six loads go into the FE model (the CAESAR case has Vc, Vl and Mt too)
  await expect(calc.locator('.wrc__fetable caption')).toContainText('all six loads');
  await expect(calc.locator('.wrc__fetable caption')).toContainText('WRC 1.78 at Du, FE 2.16 at Du');

  // Stress-intensity contour: outside and inside surface plots, a legend, and a hover readout
  const contour = calc.locator('.fe-contour');
  await expect(contour.locator('svg[data-surface]')).toHaveCount(2);
  await expect(contour).toContainText('Stress intensity (MPa)');
  const readout = contour.locator('[data-role="fe-contour-readout"]');
  await expect(readout).toContainText('Point at a plot');
  const outside = contour.locator('svg[data-surface="u"]');
  await outside.scrollIntoViewIfNeeded();
  const target = await outside.evaluate((svg) => {
    // A point just outside the attachment, on the D side (s = 1.2·r0, x = 0)
    const r0 = Number(svg.querySelector('circle').getAttribute('r'));
    const m = svg.getScreenCTM();
    const p = new DOMPoint(1.2 * r0, 0).matrixTransform(m);
    return { x: p.x, y: p.y };
  });
  await page.mouse.move(target.x, target.y);
  await expect(readout).toContainText(/Outside surface: \d+\.\d\d MPa at s = \d+ mm, x = -?\d+ mm/);

  // The downloaded report carries the FE section and the contour while the run is current
  const [download] = await Promise.all([page.waitForEvent('download'), calc.locator('[data-act="download"]').click()]);
  const report = await (await import('node:fs/promises')).readFile(await download.path(), 'utf8');
  expect(report).toContain('Shell FE cross-check (LAFEA shell solver)');
  expect(report).toContain('data-surface="l"');

  await calc.locator('[data-load="Ml"]').fill('40000');
  await expect(calc.locator('[data-slot="feResult"]')).toContainText('Inputs have changed');
});
