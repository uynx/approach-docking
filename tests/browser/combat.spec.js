import { test, expect } from '@playwright/test';

test('recovery training uses mouse aiming and the shared combat simulation',async ({page})=>{
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/arena');
  await page.getByRole('button',{name:'Recovery training',exact:true}).click();
  await expect(page.locator('#combat-mode')).toHaveText('RECOVERY TRAINING');
  await expect(page.locator('#viewport')).toHaveAttribute('data-rendered','true');
  await expect(page.locator('#training-tip')).toContainText('spin');
  const fuel=Number(await page.locator('#combat-fuel').textContent());
  await page.keyboard.down('w');await page.waitForTimeout(800);await page.keyboard.up('w');
  await expect.poll(async()=>Number(await page.locator('#combat-fuel').textContent())).toBeLessThan(fuel);
  await page.getByRole('button',{name:'Use recovery override',exact:true}).click();
  await expect(page.locator('#power-1')).toContainText('EMPTY');
  expect(errors).toEqual([]);
});

test('two combat browsers see the same hit, weakened ship and round winner',async ({browser})=>{
  test.setTimeout(90000);
  const a=await browser.newContext(),b=await browser.newContext();
  try {
    const one=await a.newPage(),two=await b.newPage();
    await one.goto('/arena');await two.goto('/arena');
    await one.getByLabel('Callsign').fill('Alice');await one.getByRole('button',{name:'Create PvP room'}).click();
    await expect(one.locator('#combat-room')).toHaveText(/^[A-Z2-9]{6}$/);
    const room=await one.locator('#combat-room').textContent();
    await two.getByLabel('Callsign').fill('Bob');await two.getByLabel('Room code').fill(room);
    await two.getByRole('button',{name:'Join PvP room'}).click();
    await one.getByRole('button',{name:'Ready to fight'}).click();await two.getByRole('button',{name:'Ready to fight'}).click();
    await expect(one.locator('#combat-mode')).toHaveText('LIVE PVP',{timeout:10000});
    await expect(two.locator('#combat-mode')).toHaveText('LIVE PVP');
    await one.keyboard.down('Space');
    await expect(two.locator('#hull-value')).toHaveText('0',{timeout:10000});
    await one.keyboard.up('Space');
    await expect(one.locator('#combat-score')).toHaveText('1 : 0');
    await expect(two.locator('#combat-score')).toHaveText('0 : 1');
    await expect(two.locator('#round-message')).toContainText('Alice wins');
    await two.reload();
    await expect(two.locator('#combat-room')).toHaveText(room);
  } finally {await a.close();await b.close();}
});
