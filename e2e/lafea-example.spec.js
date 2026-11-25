import { expect, test } from '@playwright/test';

test.setTimeout(180000);

test('LAFEA example: load → mesh → solve → convergence → results published', async ({ page }) => {
  await page.goto('/index.html#LAFEA');
  const bar = page.locator('[data-role="lafea-example-bar"]');
  await expect(bar.locator('[data-lafea-example="solve"]')).toBeDisabled();
  // Duplicate EMP.1 entry and unimplemented LAFEA.6 are hidden in this view
  await expect(page.locator('[data-app-view="LAFEA"] .lafea-workbench__stages [data-product-id="EMP.1"]')).toBeHidden();

  await bar.locator('[data-lafea-example="load"]').click();
  await expect(bar.locator('[data-lafea-example-status]')).toContainText('Mesh 40 mm qualified');

  const summary = await page.evaluate(() => globalThis.LafeaEmpApp.getController('LAFEA').solveExample());
  expect(summary.status).toBe('CURRENT_PASS');
  expect(summary.classification).toBe('MONOTONIC_CONVERGING');
  expect(summary.resultReady).toBe(true);
  expect(summary.levels.map((l) => l.h)).toEqual([40, 20, 10]);
  // Converging monotonically towards beam theory (Timoshenko): within 3% on the fine mesh
  const values = summary.levels.map((l) => Math.abs(l.value));
  expect(values[1]).toBeGreaterThan(values[0]);
  expect(values[2]).toBeGreaterThan(values[1]);
  expect(Math.abs(summary.differencePercent)).toBeLessThan(3);
  await expect(bar.locator('[data-lafea-example-status]')).toContainText('Results are published');
  await expect(page.locator('[data-app-view="LAFEA"]')).toContainText('Results are ready for review');
});
