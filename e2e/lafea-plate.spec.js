import { expect, test } from '@playwright/test';

// The solve and 3-level study run in the page: about 30 s on a fast machine, several times that on a
// shared CI runner or the unbundled dev server.
test.setTimeout(420000);

test('LAFEA plate form: plate with a hole in tension converges and gives Kt ≈ 3', async ({ page }) => {
  await page.goto('/index.html#LAFEA');
  await page.evaluate(() => localStorage.removeItem('lafea-emp-app/lafea-plate'));
  await page.goto('/index.html#LAFEA');
  await page.evaluate(() => globalThis.LafeaEmpApp.whenReady('LAFEA'));
  const form = page.locator('[data-role="lafea-plate"]');
  await form.locator('summary').click();
  // Fields that do not apply are hidden
  await expect(form.locator('[data-plate-probe-custom]')).toBeHidden();
  await form.locator('[data-plate="shape"]').selectOption('RECT');
  await expect(form.locator('[data-plate="holeDiameter"]')).toBeHidden();
  await form.locator('[data-plate="shape"]').selectOption('HOLE');
  await expect(form.locator('[data-plate="holeDiameter"]')).toBeVisible();

  // A plain reason for unusable input, and no model is built
  await form.locator('[data-plate="meshSize"]').fill('5');
  await form.locator('[data-plate-act="build"]').click();
  await expect(form.locator('[data-plate-errors]')).toContainText('too fine');
  await expect(form.locator('[data-plate-act="solve"]')).toBeDisabled();

  // The default Kt example: 400 × 200 mm plate, 20 mm hole, 100 MPa on the right edge, left edge fixed
  await form.locator('[data-plate-act="reset"]').click();
  await expect(form.locator('[data-plate="meshSize"]')).toHaveValue('40');
  await form.locator('[data-plate-act="build"]').click();
  await expect(form.locator('[data-plate-result]')).toContainText('Model built');
  await expect(page.locator('[data-lafea-example-status]')).toContainText('plate with a 20 mm hole');

  await form.locator('[data-plate-act="solve"]').click();
  await expect(form.locator('.app-plate__levels tbody tr')).toHaveCount(3, { timeout: 360000 });
  await expect(form.locator('[data-plate-result]')).toContainText('Convergence passed');
  await expect(form.locator('[data-plate-result]')).toContainText('Results are published');
  const ktText = await form.locator('.app-plate__kt b').textContent();
  const kt = Number(ktText.match(/= (\d+\.\d+)$/)[1]);
  expect(kt).toBeGreaterThan(2.97);
  expect(kt).toBeLessThan(3.08);
  await expect(form.locator('.app-plate__kt')).toContainText('reference 3.02');
  await expect(page.locator('[data-app-view="LAFEA"]')).toContainText('Results are ready for review');

  // Inputs are remembered
  await page.reload();
  await page.evaluate(() => globalThis.LafeaEmpApp.whenReady('LAFEA'));
  await expect(page.locator('[data-role="lafea-plate"] [data-plate="holeDiameter"]')).toHaveValue('20');
});
