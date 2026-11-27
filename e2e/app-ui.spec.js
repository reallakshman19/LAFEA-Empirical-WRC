import { expect, test } from '@playwright/test';

// Roadmap PL-06: one look, layouts for a laptop, a tablet and a phone, and keyboard and screen-reader use.

test.beforeEach(async ({ page }) => {
  await page.goto('/index.html#EMPIRICAL');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

/** Visible inputs, selects and buttons under `selector` that have no accessible name. */
function unnamedControls(page, selector) {
  return page.evaluate((root) => {
    const out = [];
    for (const el of document.querySelectorAll(`${root} :is(input, select, textarea, button)`)) {
      if (el.type === 'hidden' || el.type === 'file' || el.closest('[hidden]')) continue;
      const labelled = el.getAttribute('aria-labelledby')?.split(/\s+/u).map((id) => document.getElementById(id)?.textContent ?? '').join(' ');
      const name = [el.getAttribute('aria-label'), labelled, ...[...(el.labels ?? [])].map((label) => label.textContent),
        el.matches('button') ? el.textContent : ''].join(' ').trim();
      if (!name) out.push(el.outerHTML.slice(0, 100));
    }
    return out;
  }, selector);
}

test('the view tabs work from the keyboard and as links', async ({ page }) => {
  const empirical = page.locator('[data-app-nav="EMPIRICAL"]');
  await expect(empirical).toHaveAttribute('aria-selected', 'true');
  await expect(page).toHaveTitle('Empirical / WRC · LAFEA + Empirical/WRC');
  // Only the open tab is in the Tab order. The arrows move between tabs; Enter opens one.
  await expect(page.locator('[data-app-nav][tabindex="0"]')).toHaveCount(1);
  await empirical.focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('[data-app-nav="STATUS"]')).toBeFocused();
  await expect(page.locator('[data-app-view="EMPIRICAL"]')).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-app-view="STATUS"]')).toBeVisible();
  await expect(page).toHaveURL(/#STATUS$/u);
  await expect(page).toHaveTitle(/^Status & roadmap · /u);
  await page.keyboard.press('ArrowRight'); // wraps round to the first tab, without opening it
  await expect(page.locator('[data-app-nav="LAFEA"]')).toBeFocused();
  await expect(page.locator('[data-app-view="STATUS"]')).toBeVisible();

  // A link (or the address bar) switches views without a reload.
  await page.evaluate(() => { globalThis.location.hash = '#empirical'; });
  await expect(page.locator('[data-app-view="EMPIRICAL"]')).toBeVisible();
  await expect(page.locator('[data-app-view="STATUS"]')).toBeHidden();

  // The sub-tabs follow the same keys.
  await page.locator('[data-empirical-nav="WRC"]').focus();
  await page.keyboard.press('End');
  await expect(page.locator('[data-empirical-nav="WORKFLOW"]')).toBeFocused();
  await expect(page.locator('[data-empirical-nav="WRC"]')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#empirical-panel-WRC')).toHaveAttribute('role', 'tabpanel');

  // "Skip to content" is the first stop on the page and moves the focus to the open view.
  const skip = page.locator('.app-skip');
  expect(await page.evaluate(() => document.querySelector('#app-root :is(a, button)')?.className)).toBe('app-skip');
  await skip.focus();
  await expect(skip).toBeInViewport();
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-app-view="EMPIRICAL"]')).toBeFocused();
});

test('the WRC result is spoken once and kept in view on a tablet', async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  const calc = page.locator('[data-empirical-subview="WRC"]');
  await calc.locator('[data-act="example"]').selectOption('GAMMA5_ORACLE');
  // Screen readers hear one sentence, not the whole results panel at each keystroke.
  await expect(calc.locator('[data-role="wrc-live"]')).toHaveText('Governing stress intensity 72.67 MPa at point Au.');
  await expect(calc.locator('.wrc__results')).not.toHaveAttribute('aria-live', /./u);

  const strip = calc.locator('[data-role="wrc-summary"]');
  await expect(strip).toBeVisible();
  await expect(strip).toContainText('Governing 72.67 MPa at Au · γ = 5 row');
  // It stays just under the app bar while the form scrolls.
  await page.mouse.wheel(0, 1500);
  await expect.poll(() => page.evaluate(() => {
    const top = document.querySelector('[data-role="wrc-summary"]').getBoundingClientRect().top;
    return Math.round(top - document.querySelector('.app-nav').getBoundingClientRect().bottom);
  })).toBe(0);
  await strip.getByRole('button', { name: 'Results ↓' }).click();
  await expect(calc.locator('#wrc-results-heading')).toBeFocused();

  // Out of range: the strip says so, and the chip writes out its allowed range (no tooltip on a tablet).
  await calc.locator('[data-act="example"]').selectOption('CAESAR_GAMMA48');
  await calc.locator('[data-k="shellThickness"]').fill('2');
  await expect(strip).toContainText('Not calculated');
  await expect(calc.locator('.wrc__chip--bad em').first()).toContainText('Allowed');
  await expect(calc.locator('[data-role="wrc-live"]')).toContainText('Not calculated.');

  // A phone: nothing is wider than the screen.
  await page.setViewportSize({ width: 375, height: 812 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
  // A laptop: form and results side by side, so the strip is not needed.
  await page.setViewportSize({ width: 1366, height: 768 });
  await expect(strip).toBeHidden();
});

test('load cases can be picked from the keyboard', async ({ page }) => {
  const calc = page.locator('[data-empirical-subview="WRC"]');
  await calc.locator('[data-act="example"]').selectOption('GAMMA5_ORACLE');
  await calc.locator('[data-act="addCase"]').click();
  await expect(calc.locator('[data-casename]')).toBeFocused();
  await calc.locator('[data-casename]').fill('Second');
  await expect(calc.locator('.wrc__envelope tbody tr')).toHaveCount(2);

  await calc.locator('.wrc__envelope button[data-case="0"]').focus();
  await page.keyboard.press('Enter');
  await expect(calc.locator('.wrc__envelope tr[data-case="0"]')).toHaveClass(/is-active/u);
  await expect(calc.locator('[data-casename]')).toHaveValue('Case 1');
  // The table is drawn again; the focus stays on the case that was picked.
  await expect(calc.locator('.wrc__envelope button[data-case="0"]')).toBeFocused();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  await expect(calc.locator('[data-casename]')).toHaveValue('Second');
});

test('every control in the calculator and on the status page has a name', async ({ page }) => {
  const calc = page.locator('[data-empirical-subview="WRC"]');
  for (const example of ['GAMMA5_ORACLE', 'PAD_36IN', 'LUG_200X100', 'TRUNNION_10IN']) {
    await calc.locator('[data-act="example"]').selectOption(example);
    expect(await unnamedControls(page, '[data-app-view="EMPIRICAL"]'), example).toEqual([]);
  }
  await page.locator('[data-app-nav="STATUS"]').click();
  expect(await unnamedControls(page, '[data-app-view="STATUS"]')).toEqual([]);
  expect(await unnamedControls(page, '.app-nav')).toEqual([]);
});
