import { expect, test } from '@playwright/test';

// Roadmap PL-06 part 2: inch/lbf/psi units and help text on every input of the WRC calculator.

test.beforeEach(async ({ page }) => {
  await page.goto('/index.html#EMPIRICAL');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test('US units show the same case in inches, lbf and psi, and SI brings the typed values back', async ({ page }) => {
  const calc = page.locator('[data-empirical-subview="WRC"]');
  await calc.locator('[data-act="example"]').selectOption('PAD_36IN');
  await expect(calc.locator('.wrc__gov strong')).toHaveText('108.78 MPa');

  await calc.locator('[data-k="units"]').selectOption('US');
  // Lengths in inches (7 significant figures), loads converted to lbf and ft·lbf, results in psi.
  await expect(calc.locator('[data-k="shellOutsideDiameter"]')).toHaveValue('85.07874');
  await expect(calc.locator('[data-unit-kind="length"]').first()).toHaveText('in');
  await expect(calc.locator('[data-k="designPressure"] + em')).toHaveText('psi');
  await expect(calc.locator('[data-k="forceUnit"]')).toHaveValue('lbf');
  await expect(calc.locator('[data-k="momentUnit"]')).toHaveValue('ft·lbf');
  await expect(calc.locator('[data-load="P"]')).toHaveValue('-5828.619');
  await expect(calc.locator('.wrc__gov strong')).toHaveText('15777 psi');
  await expect(calc.locator('.wrc__gov b')).toHaveText('Cu');
  await expect(calc.locator('.wrc__points caption').first()).toContainText('psi (lbf/in²)');

  // A value typed in inches is stored in mm; the boxes left alone keep their exact values.
  await calc.locator('[data-k="shellThickness"]').fill('1');
  await expect(calc.locator('[data-location="PAD_EDGE"] .wrc__chip').first()).toContainText('1.000 in');
  // At the attachment the 25 mm pad is added: 1 + 25/25.4 = 1.984 in.
  await expect(calc.locator('[data-location="JUNCTION"] .wrc__chip').first()).toContainText('1.984 in');

  await calc.locator('[data-k="units"]').selectOption('SI');
  await expect(calc.locator('[data-k="shellOutsideDiameter"]')).toHaveValue('2161');
  await expect(calc.locator('[data-k="shellThickness"]')).toHaveValue('25.4');
  await expect(calc.locator('[data-load="P"]')).toHaveValue('-25926.99');
  await expect(calc.locator('[data-k="forceUnit"]')).toHaveValue('N');

  // The choice is kept with the case: after a reload it is still SI here, and US survives too.
  await calc.locator('[data-k="units"]').selectOption('US');
  await page.reload();
  await expect(page.locator('[data-empirical-subview="WRC"] [data-k="units"]')).toHaveValue('US');
  await expect(page.locator('[data-empirical-subview="WRC"] [data-k="shellThickness"]')).toHaveValue('1');
});

test('an example opens in the units you chose', async ({ page }) => {
  const calc = page.locator('[data-empirical-subview="WRC"]');
  await calc.locator('[data-k="units"]').selectOption('US');
  await calc.locator('[data-act="example"]').selectOption('GAMMA5_ORACLE');
  await expect(calc.locator('[data-k="units"]')).toHaveValue('US');
  await expect(calc.locator('[data-k="shellOutsideDiameter"]')).toHaveValue('8.661417');
  await expect(calc.locator('[data-load="P"]')).toHaveValue('-224.8089');
  await expect(calc.locator('.wrc__gov strong')).toHaveText('10540 psi');
  await expect(calc.locator('[data-role="wrc-live"]')).toHaveText('Governing stress intensity 10540 psi at point Au.');
});

test('every input has help text that screen readers read with it, and it can be hidden', async ({ page }) => {
  const calc = page.locator('[data-empirical-subview="WRC"]');
  const inputs = calc.locator('form :is(input, select):visible');
  for (const example of ['CAESAR_GAMMA48', 'LUG_200X100', 'TRUNNION_10IN', 'PAD_36IN']) {
    await calc.locator('[data-act="example"]').selectOption(example);
    const count = await inputs.count();
    expect(count, example).toBeGreaterThan(15);
    for (let i = 0; i < count; i += 1) await expect(inputs.nth(i), `${example} input ${i}`).toHaveAccessibleDescription(/\w{3}/u);
  }
  await expect(calc.locator('[data-load="P"]')).toHaveAccessibleDescription(/pushes the attachment into the shell/u);
  await expect(calc.locator('[data-k="units"]')).toHaveAccessibleDescription(/loads switch to the matching units/u);

  // "Help text" off hides the lines (screen readers still get them) and is remembered.
  const help = calc.locator('#wrc-help-shellThickness');
  await expect(help).toBeVisible();
  await calc.getByLabel('Help text').uncheck();
  await expect(help).toBeHidden();
  await expect(calc.locator('[data-k="shellThickness"]')).toHaveAccessibleDescription(/corrosion allowance is taken off/u);
  await page.reload();
  await expect(page.locator('#wrc-help-shellThickness')).toBeHidden();
  await page.getByLabel('Help text').check();
  await expect(page.locator('#wrc-help-shellThickness')).toBeVisible();
});
