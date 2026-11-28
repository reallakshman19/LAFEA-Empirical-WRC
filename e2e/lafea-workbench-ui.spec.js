import { expect, test } from '@playwright/test';

// PL-06 part 3: the LAFEA workbench and the advanced EMP.1 workflow inside the app, and the plate form.
test.setTimeout(180000);

/** Visible controls in `root` with no accessible name (aria-label, aria-labelledby, a label or their text). */
function unnamedControls(root) {
  const nameOf = (el) => {
    if (el.getAttribute('aria-label')?.trim()) return el.getAttribute('aria-label');
    const ids = el.getAttribute('aria-labelledby');
    if (ids) return ids.split(/\s+/).map((id) => document.getElementById(id)?.textContent ?? '').join(' ').trim();
    if (el.labels?.length) return [...el.labels].map((l) => l.textContent).join(' ').trim();
    if (['BUTTON', 'SUMMARY', 'A'].includes(el.tagName)) return el.textContent.trim() || el.getAttribute('title') || '';
    return el.getAttribute('title') || '';
  };
  return [...root.querySelectorAll('input, select, textarea, button, summary, a[href], [tabindex="0"]')]
    .filter((el) => el.checkVisibility() && el.type !== 'hidden' && el.type !== 'file' && !nameOf(el))
    .map((el) => el.outerHTML.slice(0, 100));
}

async function openLafea(page) {
  await page.goto('/index.html#LAFEA');
  await page.evaluate(() => globalThis.LafeaEmpApp.whenReady('LAFEA'));
}

test('workbench: technical details hidden by default, one look, names, and the mesh is one Tab stop', async ({ page }) => {
  await page.goto('/index.html#LAFEA');
  await page.evaluate(() => localStorage.removeItem('lafea-emp-app/tech-details'));
  await openLafea(page);
  const view = page.locator('[data-app-view="LAFEA"]');
  await view.locator('[data-lafea-example="load"]').click();
  await expect(view.locator('[data-lafea-example-status]')).toContainText('Mesh 40 mm qualified');

  // Off by default: no JSON paths, custody block or raw render codes on the main screens.
  const techSwitch = view.locator('[data-tech-switch]');
  await expect(techSwitch).not.toBeChecked();
  await expect(view.locator('.lafea-doc-path').first()).toBeHidden();
  await expect(view.locator('.lafea-workbench__header .lafea-workbench__custody-details')).toBeHidden();
  await expect(view.locator('[data-role="lafea-live-result-blocked-status"] ul')).toBeHidden();
  // The inputs themselves stay.
  await expect(view.locator('[data-role="lafea-governed-input"]').first()).toBeVisible();

  // The same look as the rest of the app: the theme background and font.
  const look = await view.locator('.lafea-workbench').evaluate((el) => {
    const s = getComputedStyle(el);
    return { background: s.backgroundColor, font: s.fontFamily };
  });
  expect(look.background).toBe('rgb(2, 7, 17)');
  expect(look.font).toContain('system-ui');

  // Every control has a name (the formulation box and the model view included).
  expect(await view.evaluate(unnamedControls)).toEqual([]);
  await expect(view.locator('[data-layer="engineering-overlay"]')).toHaveAttribute('aria-label', /Model view/);

  // The mesh is one Tab stop; arrow keys move between elements.
  const elements = view.locator('[data-mesh-element-id]');
  expect(await elements.count()).toBeGreaterThan(1);
  await expect(view.locator('[data-mesh-element-id][tabindex="0"]')).toHaveCount(1);
  const first = view.locator('[data-mesh-element-id][tabindex="0"]');
  const firstId = await first.getAttribute('data-mesh-element-id');
  await first.focus();
  await page.keyboard.press('ArrowRight');
  const focusedId = await page.evaluate(() => document.activeElement?.dataset.meshElementId);
  expect(focusedId).toBeTruthy();
  expect(focusedId).not.toBe(firstId);
  await expect(view.locator('[data-mesh-element-id][tabindex="0"]')).toHaveAttribute('data-mesh-element-id', focusedId);

  // On: the details show where the workbench puts them, and the choice is remembered.
  await techSwitch.check();
  await expect(view.locator('.lafea-doc-path').first()).toBeVisible();
  await page.reload();
  await page.evaluate(() => globalThis.LafeaEmpApp.whenReady('LAFEA'));
  await expect(page.locator('[data-app-view="LAFEA"] [data-tech-switch]')).toBeChecked();
  await page.evaluate(() => localStorage.removeItem('lafea-emp-app/tech-details'));
});

test('advanced EMP.1 workflow: the same switch, its menus stay, every control has a name', async ({ page }) => {
  await page.goto('/index.html#EMPIRICAL');
  await page.evaluate(() => localStorage.removeItem('lafea-emp-app/tech-details'));
  await page.goto('/index.html#EMPIRICAL');
  await page.locator('[data-empirical-nav="WORKFLOW"]').click();
  const panel = page.locator('[data-empirical-subview="WORKFLOW"]');
  await expect(panel).toContainText('EMP.1', { timeout: 60000 });
  await expect(panel.locator('[data-tech-switch]')).not.toBeChecked();
  await expect(panel.locator('.lafea-workbench__header .lafea-workbench__custody-details')).toBeHidden();
  // Working menus that share the workbench's "details" style are not hidden.
  await expect(panel.locator('summary', { hasText: 'More actions' })).toBeVisible();
  expect(await panel.evaluate(unnamedControls)).toEqual([]);
  await panel.locator('[data-tech-switch]').check();
  await expect(panel.locator('.lafea-workbench__header .lafea-workbench__custody-details').first()).toBeVisible();
  await page.evaluate(() => localStorage.removeItem('lafea-emp-app/tech-details'));
});

test('plate form: SI or US units, and help text on every input', async ({ page }) => {
  await page.goto('/index.html#LAFEA');
  await page.evaluate(() => {
    localStorage.removeItem('lafea-emp-app/lafea-plate');
    localStorage.removeItem('lafea-emp-app/wrc-help');
  });
  await openLafea(page);
  const form = page.locator('[data-role="lafea-plate"]');
  await form.locator('summary').click();

  // Every input has a help line that screen readers read with it.
  const missing = await form.locator('input:visible, select:visible').evaluateAll((els) => els
    .filter((el) => !el.matches('[data-plate-helptoggle]'))
    .filter((el) => !(el.getAttribute('aria-describedby') ?? '').split(/\s+/).some((id) => document.getElementById(id)?.textContent.trim()))
    .map((el) => el.outerHTML.slice(0, 80)));
  expect(missing).toEqual([]);
  await expect(form.locator('[data-plate="meshSize"]')).toHaveAccessibleDescription(/convergence study also solves h\/2 and h\/4/);

  // US: the Kt example in inches and psi.
  await form.locator('[data-plate-units]').selectOption('US');
  await expect(form.locator('[data-plate="length"]')).toHaveValue('15.74803');
  await expect(form.locator('[data-plate="elasticModulus"]')).toHaveValue('29007550');
  await expect(form.locator('[data-edge="RIGHT"][data-field="normal"]')).toHaveValue('14503.77');
  await expect(form.locator('[data-edge="RIGHT"][data-field="normal"]')).toHaveAccessibleName(/psi/);
  await form.locator('[data-plate="thickness"]').fill('0.5');
  await form.locator('[data-plate-act="build"]').click();
  await expect(page.locator('[data-lafea-example-status]')).toContainText('15.75 × 7.874 in plate with a 0.7874 in hole, t = 0.5 in');
  await form.locator('[data-plate="meshSize"]').fill('0.2');
  await form.locator('[data-plate-act="build"]').click();
  await expect(form.locator('[data-plate-errors]')).toContainText('Mesh size 0.2 in is too fine');

  // Back in SI: the stored values, 0.5 in = 12.7 mm, and the typed SI values unchanged.
  await form.locator('[data-plate-units]').selectOption('SI');
  await expect(form.locator('[data-plate="length"]')).toHaveValue('400');
  await expect(form.locator('[data-plate="thickness"]')).toHaveValue('12.7');
  await expect(form.locator('[data-edge="RIGHT"][data-field="normal"]')).toHaveValue('100');

  // The help toggle hides the lines and is remembered (shared with the WRC calculator).
  await expect(form.locator('#plate-help-length')).toBeVisible();
  await form.locator('[data-plate-helptoggle]').uncheck();
  await expect(form.locator('#plate-help-length')).toBeHidden();
  await page.reload();
  await page.evaluate(() => globalThis.LafeaEmpApp.whenReady('LAFEA'));
  await page.locator('[data-role="lafea-plate"] summary').click();
  await expect(page.locator('#plate-help-length')).toBeHidden();
  await page.evaluate(() => {
    localStorage.removeItem('lafea-emp-app/lafea-plate');
    localStorage.removeItem('lafea-emp-app/wrc-help');
  });
});
