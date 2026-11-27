import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/index.html#EMPIRICAL');
  await page.evaluate(() => localStorage.clear());
});

test('Status & roadmap tab lists known issues, planned improvements and the roadmap', async ({ page }) => {
  // A hash-only navigation does not reload the page, so reload to open on #STATUS.
  await page.goto('/index.html#STATUS');
  await page.reload();
  const view = page.locator('[data-app-view="STATUS"]');
  await expect(view).toBeVisible();
  await expect(page.locator('[data-app-nav="STATUS"]')).toHaveAttribute('aria-pressed', 'true');

  for (const id of ['vision', 'today', 'issues', 'planned', 'roadmap', 'decisions']) {
    await expect(view.locator(`[data-status-section="${id}"]`)).toBeVisible();
  }
  await expect(view.locator('[data-pillar]')).toHaveCount(3);
  await expect(view.locator('[data-issue-id]')).toHaveCount(19);
  await expect(view.locator('[data-plan-id]')).toHaveCount(9);
  await expect(view.locator('[data-stage-id]')).toHaveCount(4);
  await expect(view.locator('[data-stage-id="A"]')).toContainText('Universal canvas');
  await expect(view.locator('[data-stage-id="A"]')).toContainText('trunnions');
  await expect(view.locator('[data-role="decisions-made"] li').first()).toContainText('cylindrical shells');

  // Area filter: only that area's issues stay visible, and "All" brings them back.
  await view.locator('[data-issue-filter="LAFEA"]').click();
  await expect(view.locator('[data-issue-filter="LAFEA"]')).toHaveAttribute('aria-pressed', 'true');
  const lafea = view.locator('[data-issue-id][data-area="LAFEA"]');
  const lafeaCount = await lafea.count();
  expect(lafeaCount).toBeGreaterThan(0);
  await expect(view.locator('[data-issue-id]:visible')).toHaveCount(lafeaCount);
  await view.locator('[data-issue-filter="ALL"]').click();
  await expect(view.locator('[data-issue-id]:visible')).toHaveCount(19);
});

test('the status tab loads without fetching the LAFEA workbench, and the other tabs still work', async ({ page }) => {
  const controllerRequests = [];
  page.on('request', (request) => {
    if (/standalone-controller/u.test(request.url())) controllerRequests.push(request.url());
  });
  // Open on the Empirical tab (the default tab is LAFEA, which loads the workbench).
  await page.reload();
  await page.locator('[data-app-nav="STATUS"]').click();
  await expect(page.locator('[data-status-section="issues"]')).toBeVisible();
  expect(controllerRequests).toEqual([]);

  await page.locator('[data-app-nav="EMPIRICAL"]').click();
  await expect(page.locator('[data-empirical-subview="WRC"]')).toBeVisible();
  await expect(page.locator('[data-app-view="STATUS"]')).toBeHidden();
});
