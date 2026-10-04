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
  await page.waitForTimeout(6500);
  await expect(page.getByRole('alert')).toBeVisible();
});

test('practice renders a 3D view and thrusters change flight instruments', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Dock a spacecraft.' })).toBeVisible();
  await page.getByRole('button', { name: 'Practice flight' }).click();
  await expect(page.locator('#mode')).toHaveText('PRACTICE');
  await expect(page.locator('#camera-mode')).toHaveText('DOCKING CAM');
  await expect.poll(async () => Number(await page.locator('#range').textContent())).toBeLessThan(26);
  await expect(page.locator('#guidance')).toContainText('W');
  await expect(page.locator('#viewport')).toHaveAttribute('data-rendered', 'true');
  const fuel = Number(await page.locator('#fuel').textContent());
  await page.keyboard.down('w');
  await expect.poll(async () => Number(await page.locator('#closing').textContent())).toBeGreaterThan(0.1);
  await page.keyboard.up('w');
  expect(Number(await page.locator('#fuel').textContent())).toBeLessThan(fuel);
  expect(Number(await page.locator('#closing').textContent())).toBeGreaterThan(0.1);
  await page.getByRole('button', { name: 'Camera' }).click();
  await expect(page.locator('#camera-mode')).toHaveText('CHASE CAM');
  expect(errors).toEqual([]);
});

for (const view of ['DOCKING CAM', 'CHASE CAM']) {
  test(`mouse look changes ${view} without rotating the ship`, async ({ page }) => {
    await page.addInitScript(() => {
      window.requestAnimationFrame = callback => { window.flightFrame = callback; return 1; };
    });
    await page.goto('/');
    await page.getByRole('button', { name: 'Practice flight' }).click();
    if (view === 'CHASE CAM') await page.getByRole('button', { name: 'Camera', exact: true }).click();
    const time = await page.evaluate(() => performance.now());
    const image = () => page.evaluate(now => {
      window.flightFrame(now);
      const canvas = document.getElementById('viewport');
      const gl = canvas.getContext('webgl2');
      const pixels = new Uint8Array(canvas.width * canvas.height * 4);
      gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      let hash = 2166136261;
      for (const pixel of pixels) hash = Math.imul(hash ^ pixel, 16777619);
      return hash;
    }, time);
    const before = await image();
    const alignment = await page.locator('#alignment').textContent();
    const fuel = await page.locator('#fuel').textContent();
    await page.mouse.move(600, 400);
    await page.mouse.down({ button: 'right' });
    await page.mouse.move(820, 470, { steps: 8 });
    await page.mouse.up({ button: 'right' });
    const after = await image();
    expect(after).not.toBe(before);
    await expect(page.locator('#alignment')).toHaveText(alignment);
    await expect(page.locator('#fuel')).toHaveText(fuel);
    await expect(page.locator('.reticle')).toBeHidden();
    await page.mouse.move(700, 350);
    expect(await image()).toBe(after);
    await page.keyboard.press('v');
    expect(await image()).toBe(before);
    await expect(page.locator('.reticle')).toBeVisible();
    await page.mouse.down({ button: 'right' });
    await page.mouse.move(850, 420);
    await page.mouse.up({ button: 'right' });
    expect(await image()).not.toBe(before);
    await page.getByRole('button', { name: 'Center view' }).click();
    expect(await image()).toBe(before);
  });
}

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
  await expect.poll(async () => Number(await two.locator('#opponent-range').textContent())).toBeLessThan(25);
  await one.reload();
  await expect(one.locator('#mode')).toHaveText('FLIGHT');
  await expect(one.locator('#opponent-name')).toHaveText('Bob');
  await one.getByRole('button', { name: 'Leave flight' }).click();
  await expect(two.locator('#opponent-status')).toHaveText('Approach failed');
  await a.close(); await b.close();
});
