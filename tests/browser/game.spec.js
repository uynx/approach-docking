import { test, expect } from '@playwright/test';

test('blocked WebGL reports a useful explanation instead of a renderer exception', async ({ page }) => {
  await page.addInitScript(() => {
    const original = WebGL2RenderingContext.prototype.getParameter;
    WebGL2RenderingContext.prototype.getParameter = function(parameter) {
      return parameter === this.VERSION ? null : original.call(this, parameter);
    };
  });
  await page.goto('/');
  await expect(page.getByRole('alert')).toContainText('WebGL is blocked or unavailable');
  await expect(page.getByRole('alert')).not.toContainText('indexOf');
});

test('practice renders a 3D view and thrusters change flight instruments', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Dock a spacecraft.' })).toBeVisible();
  await page.getByRole('button', { name: 'Practice flight' }).click();
  await expect(page.locator('#mode')).toHaveText('PRACTICE');
  await expect(page.locator('#viewport')).toHaveAttribute('data-rendered', 'true');
  const fuel = Number(await page.locator('#fuel').textContent());
  await page.keyboard.down('w');
  await expect.poll(async () => Number(await page.locator('#closing').textContent())).toBeGreaterThan(0.1);
  await page.keyboard.up('w');
  expect(Number(await page.locator('#fuel').textContent())).toBeLessThan(fuel);
  expect(Number(await page.locator('#closing').textContent())).toBeGreaterThan(0.1);
  await page.getByRole('button', { name: 'Camera' }).click();
  await expect(page.locator('#camera-mode')).toHaveText('DOCKING CAM');
  expect(errors).toEqual([]);
});

test('two browser sessions join a room and share a countdown and flight', async ({ browser }) => {
  const a = await browser.newContext(), b = await browser.newContext();
  const one = await a.newPage(), two = await b.newPage();
  await one.goto('/'); await two.goto('/');
  await one.getByLabel('Callsign').fill('Alice');
  await one.getByRole('button', { name: 'Create room' }).click();
  await expect(one.locator('#room-code')).toHaveText(/^[A-Z2-9]{6}$/);
  const code = await one.locator('#room-code').textContent();
  await two.getByLabel('Callsign').fill('Bob');
  await two.getByLabel('Room code').fill(code);
  await two.getByRole('button', { name: 'Join room' }).click();
  await expect(one.locator('#opponent-name')).toHaveText('Bob');
  await one.getByRole('button', { name: 'Ready to fly' }).click();
  await two.getByRole('button', { name: 'Ready to fly' }).click();
  await expect(one.locator('#mode')).toHaveText('FLIGHT', { timeout: 10000 });
  await expect(two.locator('#mode')).toHaveText('FLIGHT');
  await one.keyboard.down('w');
  await one.waitForTimeout(1500);
  await one.keyboard.up('w');
  await expect.poll(async () => Number(await two.locator('#opponent-range').textContent())).toBeLessThan(150);
  await one.reload();
  await expect(one.locator('#mode')).toHaveText('FLIGHT');
  await expect(one.locator('#opponent-name')).toHaveText('Bob');
  await a.close(); await b.close();
});
