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
  page.on('console', message => {if(message.type()==='error')errors.push(message.text());});
  await page.goto('/');
  await expect(page.locator('#flight-ui')).toBeVisible({timeout:15000});
  await expect(page.locator('#welcome')).toBeHidden();
  await page.getByRole('button', { name: 'Practice flight' }).click();
  await expect(page.locator('#mode')).toHaveText('PRACTICE');
  await expect(page.locator('#camera-mode')).toHaveText('CHASE CAM');
  await expect.poll(async () => Number(await page.locator('#range').textContent())).toBeLessThan(26);
  await expect(page.locator('#guidance')).toContainText(/[Aa]rrow.key/);
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

for (const view of ['DOCKING CAM', 'CHASE CAM']) {
  test(`mouse look changes ${view} without rotating the ship`, async ({ page }) => {
    await page.addInitScript(() => {
      window.requestAnimationFrame = callback => { window.flightFrame = callback; return 1; };
    });
    await page.goto('/');
    await page.getByRole('button', { name: 'Practice flight' }).click();
    if (view === 'DOCKING CAM') await page.getByRole('button', { name: 'Camera', exact: true }).click();
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
  test.setTimeout(90000);
  const a = await browser.newContext(), b = await browser.newContext();
  const one = await a.newPage(), two = await b.newPage();
  await one.goto('/'); await two.goto('/');
  await one.getByRole('button', {name:'Multiplayer',exact:true}).click();
  await one.getByLabel('Callsign').fill('Alice');
  await one.getByRole('button', { name: 'Create room' }).click();
  await expect(one.locator('#room-code')).toHaveText(/^[A-Z2-9]{6}$/);
  const code = await one.locator('#room-code').textContent();
  await two.getByRole('button', {name:'Multiplayer',exact:true}).click();
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
  await one.getByRole('button', {name:'Multiplayer',exact:true}).click();
  await one.getByRole('button', { name: 'Leave flight' }).click();
  await expect(two.locator('#opponent-status')).toHaveText('Approach failed');
  await a.close(); await b.close();
});

test('new flight modules and NASA textures are served with their actual MIME types', async ({ request }) => {
  for (const [path,type] of [['state.js','text/javascript'],['damage-effects.js','text/javascript'],['flight-view.js','text/javascript'],['damage.js','text/javascript'],['models.js','text/javascript'],['tutorial.js','text/javascript'],['assets/earth.jpg','image/jpeg'],['assets/stars.jpg','image/jpeg'],['assets/moon.jpg','image/jpeg']]) {
    const response=await request.get('/'+path);
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain(type);
    expect((await response.body()).length).toBeGreaterThan(100);
  }
});

test('a saved room resumes while background texture loading is stalled',async ({page})=>{
  test.setTimeout(60000);
  await page.goto('/');
  await page.getByRole('button',{name:'Multiplayer',exact:true}).click();
  await page.getByLabel('Callsign').fill('Alice');
  await page.getByRole('button',{name:'Create room'}).click();
  await expect(page.locator('#room-code')).toHaveText(/^[A-Z2-9]{6}$/);
  const code=await page.locator('#room-code').textContent();
  let release;
  const loading=new Promise(resolve=>{release=resolve;});
  await page.route('**/assets/moon.jpg',async route=>{await loading;await route.continue();});
  try {
    await page.reload({waitUntil:'domcontentloaded'});
    await expect(page.locator('#mode')).toHaveText('LOBBY');
    await expect(page.locator('#room-code')).toHaveText(code);
    await expect(page.getByRole('button',{name:'Practice flight',exact:true})).toBeDisabled();
  } finally {release();}
  await expect(page.getByRole('button',{name:'Practice flight',exact:true})).toBeEnabled({timeout:30000});
  await expect(page.locator('#mode')).toHaveText('LOBBY');
});

async function controlledFlight(page) {
  await page.addInitScript(() => {
    window.requestAnimationFrame=callback=>{window.flightFrame=callback;return 1;};
    const instantiate=WebAssembly.instantiate;
    WebAssembly.instantiate=async (...args)=>{const result=await instantiate(...args);window.physics=result.instance.exports;return result;};
  });
  await page.goto('/');
  await page.getByRole('button',{name:'Practice flight'}).click();
  await page.getByRole('button',{name:'Camera',exact:true}).click();
  await page.evaluate(async ()=>{
    const THREE=await import('/vendor/three.module.js');
    const updateObject=THREE.Object3D.prototype.updateMatrixWorld;
    THREE.Object3D.prototype.updateMatrixWorld=function(...args){
      if(this.name==='station')window.stationObject=this;
      if(this.name==='capsule-'+0x6daaa7)window.capsuleObject=this;
      if(this.name==='earth')window.earthObject=this;
      return updateObject.apply(this,args);
    };
    const update=THREE.Camera.prototype.updateMatrixWorld;
    for(const [i,v] of Object.entries({0:0,1:0,2:-18,3:0,4:0,5:0,6:1,7:0,8:0,9:0,10:Math.sqrt(3.986004418e14/6771000**3),11:0,12:0}))window.physics.restore(Number(i),v);
    window.views=[];
    THREE.Camera.prototype.updateMatrixWorld=function(...args){
      const camera=this;
      window.views.push({type:camera.type,near:camera.near,position:camera.position.toArray(),up:camera.up.toArray(),quaternion:camera.quaternion.toArray()});
      return update.apply(this,args);
    };
    window.frameTime=performance.now();window.flightFrame(window.frameTime);
  });
}

test('Earth starts at a new longitude and keeps rotating after docking',async ({page})=>{
  await controlledFlight(page);
  const rotation=()=>page.evaluate(()=>window.earthObject.quaternion.toArray());
  await page.getByRole('button',{name:'Practice flight',exact:true}).click();await pose(page,{14:0});
  const before=await rotation();
  await page.getByRole('button',{name:'Practice flight',exact:true}).click();await pose(page,{14:0});
  expect(await rotation()).not.toEqual(before);
  await pose(page,{15:1});const docked=await rotation();
  await pose(page,{},100);
  expect(await rotation()).not.toEqual(docked);
});

test('a struck satellite recoils and its visible mesh follows shared physics',async ({page})=>{
  await controlledFlight(page);
  await page.evaluate(()=>{for(let i=0;i<13;i++)window.physics.restore_station(15+i,i===2?-33.2:i===6?1:0);});
  await pose(page,{0:14,1:0,2:-30,3:50,4:0,5:0},100);
  expect(await page.evaluate(()=>window.physics.component(35))).toBe(2);
  expect(await page.evaluate(()=>window.physics.station_component(18))).toBeGreaterThan(0);
  const placement=await page.evaluate(()=>({
    rendered:window.stationObject.parent.getObjectByName('orbital-satellites').children[0].position.toArray(),
    physics:[window.physics.station_component(15),window.physics.station_component(16),-window.physics.station_component(17)]
  }));
  placement.rendered.forEach((v,i)=>expect(v).toBeCloseTo(placement.physics[i],8));
});

test('watching the tutorial allows pause, crash examples and returning to flight',async ({page})=>{
  test.setTimeout(60000);
  await controlledFlight(page);
  await page.getByRole('button',{name:'How to play'}).click();
  await page.getByRole('button',{name:'Watch flight tutorial'}).click();
  await expect(page.locator('#tutorial-title')).toHaveText('A clean approach');
  await pose(page,{},100);
  await page.getByRole('button',{name:'Pause tutorial'}).click();
  const elapsed=await page.evaluate(()=>window.physics.component(14));
  await pose(page,{},100);
  expect(await page.evaluate(()=>window.physics.component(14))).toBe(elapsed);
  await page.getByRole('button',{name:'Next example'}).click();
  await expect(page.locator('#tutorial-title')).toHaveText('Brake before the port');
  for(let i=0;i<25;i++)await pose(page,{},100);
  expect(await page.evaluate(()=>window.physics.component(15))).toBe(2);
  expect(Number(await page.locator('#viewport').getAttribute('data-fragments'))).toBeGreaterThan(0);
  await page.getByRole('button',{name:'Take control'}).click();
  await expect(page.locator('#tutorial')).toBeHidden();
  await expect(page.locator('#mode')).toHaveText('PRACTICE');
  expect(await page.evaluate(()=>window.physics.component(15))).toBe(0);
});

async function pose(page, values, advance=0) {
  return page.evaluate(({values,advance})=>{
    for(const [index,value] of Object.entries(values)) window.physics.restore(Number(index),value);
    window.views=[];window.frameTime+=advance;window.flightFrame(window.frameTime);
    return window.views;
  },{values,advance});
}

test('comma and period bank the capsule while the chase camera stays level', async ({page})=>{
  await controlledFlight(page);
  await page.getByRole('button',{name:'Camera',exact:true}).click();
  await page.keyboard.down(',');
  for(let i=0;i<15;i++) await pose(page,{},100);
  await page.keyboard.up(',');
  const bank=Number(await page.locator('#bank').textContent());expect(bank).toBeGreaterThan(1);
  const views=await pose(page,{});
  expect(views.find(v=>v.near===0.05).up).toEqual([0,1,0]);
  const spinBefore=await page.evaluate(()=>window.physics.component(12));
  await page.keyboard.down('.');
  for(let i=0;i<5;i++) await pose(page,{},100);
  await page.keyboard.up('.');
  expect(await page.evaluate(()=>window.physics.component(12))).toBeLessThan(spinBefore);
});

test('close approach preserves camera clearance and cues distinguish speed and offset errors', async ({page})=>{
  await controlledFlight(page);
  let views=await pose(page,{2:-0.12,5:0.1});
  expect(views.find(v=>v.near===0.05).position[2]).toBeGreaterThanOrEqual(0.05-1e-6);
  await expect(page.locator('#docking-aid')).toHaveAttribute('data-state','ready');
  await pose(page,{5:0.3});
  await expect(page.locator('#docking-aid')).toHaveAttribute('data-state','brake');
  await expect(page.locator('#cue-speed')).toHaveAttribute('data-good','false');
  await pose(page,{5:0.1,0:0.4});
  await expect(page.locator('#docking-aid')).toHaveAttribute('data-state','correct');
  await expect(page.locator('#cue-offset')).toHaveAttribute('data-good','false');
  await page.getByRole('button',{name:'Camera',exact:true}).click();
  await page.mouse.move(600,400);await page.mouse.down({button:'right'});await page.mouse.move(1380,325);await page.mouse.up({button:'right'});
  views=await pose(page,{0:0});
  expect(views.find(v=>v.near===0.05).position[2]).toBeGreaterThanOrEqual(0.05-1e-6);
});

test('an axial impact deforms the hull in the full-screen view and resets cleanly', async ({page})=>{
  await controlledFlight(page);
  await pose(page,{2:-0.2,5:3});
  for(let i=0;i<10;i++) await pose(page,{},100);
  await expect(page.locator('#viewport')).toHaveAttribute('data-damage','crushing');
  await expect(page.locator('#impact')).toContainText('kJ');
  await expect(page.locator('#impact')).not.toContainText('CRUSH 0.0 cm');
  await expect(page.locator('#side-view')).toHaveCount(0);
  const view=await page.locator('#viewport').boundingBox();
  expect(view.width).toBe(page.viewportSize().width);expect(view.height).toBe(page.viewportSize().height);
  await page.getByRole('button',{name:'Try again',exact:true}).click();
  await pose(page,{});
  await expect(page.locator('#viewport')).toHaveAttribute('data-damage','none');
  await expect(page.locator('#impact')).toHaveText('');
});

test('impact spins the station and changes its rendered orientation',async ({page})=>{
  await controlledFlight(page);
  await pose(page,{2:-0.2,5:30});
  for(let i=0;i<20;i++)await pose(page,{},100);
  const motion=await page.evaluate(()=>Array.from({length:13},(_,i)=>window.physics.station_component(i)));
  expect(Math.hypot(...motion.slice(10))).toBeGreaterThan(0.00001);
  expect(Math.hypot(...motion.slice(7,10))).toBeGreaterThan(0.00001);
  const rendered=await page.evaluate(()=>window.stationObject.quaternion.toArray());
  expect(rendered[0]).toBeCloseTo(-motion[7],8);
  expect(rendered[1]).toBeCloseTo(-motion[8],8);
  expect(rendered[2]).toBeCloseTo(motion[9],8);
  await expect(page.locator('#station-motion')).not.toContainText('0.00000 deg/s');
});

test('a high-speed solar-panel strike breaks the actual panel into visible fragments',async ({page})=>{
  await controlledFlight(page);
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await pose(page,{0:8,1:4,2:8,5:50});
  for(let i=0;i<8;i++)await pose(page,{},100);
  expect(await page.evaluate(()=>window.physics.station_component(13))).toBeGreaterThan(0);
  expect(Number(await page.locator('#viewport').getAttribute('data-fragments'))).toBeGreaterThanOrEqual(24);
  const actual=await page.evaluate(()=>({hidden:window.stationObject.children.filter(p=>p.name==='station-panel'&&!p.visible).length,
    detached:window.stationObject.parent.children.filter(p=>p.name==='station-panel-fragment').length}));
  expect(actual.hidden).toBeGreaterThanOrEqual(24);expect(actual.detached).toBe(actual.hidden);
  expect(await page.evaluate(()=>window.physics.component(5))).toBeGreaterThan(40);
  expect(errors).toEqual([]);
});

test('severe capsule impact releases actual hull sections and resets fragments',async ({page})=>{
  await controlledFlight(page);
  await pose(page,{2:-0.2,5:30});
  for(let i=0;i<10;i++)await pose(page,{},100);
  expect(Number(await page.locator('#viewport').getAttribute('data-fragments'))).toBeGreaterThan(0);
  await page.getByRole('button',{name:'Try again',exact:true}).click();await pose(page,{});
  await expect(page.locator('#viewport')).toHaveAttribute('data-fragments','0');
});

test('ruptured capsule and station tanks each produce a fuel explosion',async ({page})=>{
  await controlledFlight(page);
  await pose(page,{15:2,17:-1,18:0,19:0,20:10,21:-17.1,22:-3.5,23:13,24:0,25:-1.3,26:-0.4,27:-0.7,31:1});
  await pose(page,{},30);
  expect(await page.evaluate(()=>window.physics.component(13))).toBe(0);
  await expect(page.locator('#viewport')).toHaveAttribute('data-explosions','2');
  const tankPieces=await page.evaluate(()=>window.stationObject.parent.children.filter(p=>p.name.includes('tank-fragment')).length);
  expect(tankPieces).toBeGreaterThan(0);
});

test('high-speed crush stays bounded and a later weak hit cannot heal the hull',async ({page})=>{
  await controlledFlight(page);
  await pose(page,{2:-0.2,5:100});
  for(let i=0;i<10;i++)await pose(page,{},100);
  const vertices=()=>page.evaluate(()=>window.capsuleObject.children.filter(p=>p.name==='capsule-hull').flatMap(p=>Array.from(p.geometry.attributes.position.array)));
  const before=await vertices();
  expect(Math.max(...before.map(Math.abs))).toBeLessThan(5);
  await pose(page,{17:0,18:0,19:-1,20:0.3,24:0.5,28:2000,29:80000,30:0.15,31:99});
  const after=await vertices();
  let difference=0;before.forEach((v,i)=>difference=Math.max(difference,Math.abs(after[i]-v)));
  expect(difference).toBeLessThan(0.03);
});

test('high-speed contact permanently crushes actual capsule and station vertices',async ({page})=>{
  await controlledFlight(page);
  const vertices=()=>page.evaluate(()=>({
    capsule:window.capsuleObject.children.filter(p=>p.isMesh).flatMap(p=>Array.from(p.geometry.attributes.position.array)),
    station:window.stationObject.children.filter(p=>p.isMesh).flatMap(p=>Array.from(p.geometry.attributes.position.array))
  }));
  const before=await vertices();
  await pose(page,{2:-0.2,5:10});
  for(let i=0;i<10;i++)await pose(page,{},100);
  const after=await vertices();
  const displacement=(a,b)=>a.reduce((max,v,i)=>Math.max(max,Math.abs(v-b[i])),0);
  expect(displacement(before.capsule,after.capsule)).toBeGreaterThan(0.5);
  expect(displacement(before.station,after.station)).toBeGreaterThan(0.05);
  await pose(page,{},100);
  const later=await vertices();
  expect(displacement(after.capsule,later.capsule)).toBeLessThan(0.03);
});

test('severe contact leaves visible folds in the surviving capsule skin',async ({page})=>{
  await controlledFlight(page);
  const skin=()=>page.evaluate(()=>window.capsuleObject.children.filter(p=>p.name==='capsule-hull'&&p.visible).map(p=>Array.from(p.geometry.attributes.position.array)));
  const before=await skin();
  await pose(page,{2:-0.2,5:30});
  for(let i=0;i<10;i++)await pose(page,{},100);
  const folded=await page.evaluate(original=>{
    let largest=0;
    window.capsuleObject.children.filter(p=>p.name==='capsule-hull').forEach((part,j)=>{
      if(!part.visible)return;
      const points=part.geometry.attributes.position.array;
      for(let i=0;i<points.length;i+=3)largest=Math.max(largest,Math.abs(Math.hypot(points[i],points[i+1])-Math.hypot(original[j][i],original[j][i+1])));
    });
    return largest;
  },before);
  expect(folded).toBeGreaterThan(0.12);
});

test('solar-cell detail uses filtered texture samples instead of tiny overlapping strips',async ({page})=>{
  await controlledFlight(page);
  const detail=await page.evaluate(()=>window.stationObject.children.filter(p=>p.name==='station-panel').map(p=>({mip:p.material.map.generateMipmaps,filter:p.material.map.minFilter,anisotropy:p.material.map.anisotropy,roughness:p.material.roughness})));
  expect(detail.length).toBeGreaterThan(0);
  for(const panel of detail) {expect(panel.mip).toBe(true);expect(panel.filter).toBe(1008);expect(panel.anisotropy).toBeGreaterThan(1);expect(panel.roughness).toBeGreaterThan(0.5);}
});

test('station collar join has one opaque surface instead of overlapping shell caps',async ({page})=>{
  await controlledFlight(page);
  const surfaces=await page.evaluate(async ()=>{
    const THREE=await import('/vendor/three.module.js');
    const {stationModel}=await import('/models.js');
    const station=stationModel(1);station.group.updateMatrixWorld(true);
    station.group.traverse(part=>{if(part.isMesh)part.material=part.material.clone(),part.material.side=THREE.DoubleSide;});
    const ray=new THREE.Raycaster(new THREE.Vector3(-18.2,0.15,-1.5),new THREE.Vector3(0,0,1));
    return new Set(ray.intersectObjects(station.group.children,false).filter(hit=>Math.abs(hit.point.z+1)<1e-6).map(hit=>hit.object.id)).size;
  });
  expect(surfaces).toBe(1);
});

test('Earth remains readable beneath the sunlit spacecraft',async ({page})=>{
  await controlledFlight(page);
  await page.getByRole('button',{name:'Camera',exact:true}).click();
  const brightness=await page.evaluate(()=>{
    window.flightFrame(window.frameTime);
    const canvas=document.getElementById('viewport'),gl=canvas.getContext('webgl2');
    const width=Math.floor(canvas.width*0.2),height=Math.floor(canvas.height*0.1);
    const pixels=new Uint8Array(width*height*4);
    gl.readPixels(Math.floor(canvas.width*0.4),0,width,height,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
    let total=0;
    for(let i=0;i<pixels.length;i+=4)total+=0.2126*pixels[i]+0.7152*pixels[i+1]+0.0722*pixels[i+2];
    return total/(width*height);
  });
  expect(brightness).toBeGreaterThan(12);
});

test('reset clears wreckage even after the crashed capsule reaches the ground',async ({page})=>{
  await controlledFlight(page);
  await pose(page,{2:-0.2,5:30});
  for(let i=0;i<8;i++)await pose(page,{},100);
  expect(Number(await page.locator('#viewport').getAttribute('data-fragments'))).toBeGreaterThan(0);
  const vertices=()=>page.evaluate(()=>window.capsuleObject.children.filter(p=>p.name==='capsule-hull').flatMap(p=>Array.from(p.geometry.attributes.position.array)));
  const crushed=await vertices();
  await pose(page,{15:4});
  const grounded=await vertices();
  expect(Math.max(...grounded.map((v,i)=>Math.abs(v-crushed[i])))).toBe(0);
  await page.getByRole('button',{name:'Try again',exact:true}).click();await pose(page,{});
  await expect(page.locator('#viewport')).toHaveAttribute('data-fragments','0');
  expect(await page.evaluate(()=>window.capsuleObject.children.filter(p=>p.name==='capsule-hull'&&!p.visible).length)).toBe(0);
});

test('flight menus expose crash scenes and omit atmospheric entry practice',async ({page})=>{
  await controlledFlight(page);
  await expect(page.getByRole('button',{name:'Entry',exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'Crash lab',exact:true}).click();
  await expect(page.locator('#tutorial-title')).toHaveText('Side impact · 3 m/s');
  await page.getByLabel('Choose a scene').selectOption({label:'Side impact · 30 m/s'});
  for(let i=0;i<20;i++)await pose(page,{},100);
  expect(await page.evaluate(()=>window.physics.component(31))).toBeGreaterThan(0);
  await expect(page.locator('#viewport')).toHaveAttribute('data-damage','crushing');
  await page.getByLabel('Choose a scene').selectOption({label:'Two spacecraft head on'});
  for(let i=0;i<20;i++)await pose(page,{},100);
  expect(await page.evaluate(()=>window.physics.component(31))).toBeGreaterThan(0);
  expect(await page.evaluate(()=>window.physics.opponent_component(31))).toBeGreaterThan(0);
});

test('reset restores station fragments after an opponent-only crash',async ({page})=>{
  await controlledFlight(page);
  const result=await page.evaluate(async ()=>{
    const THREE=await import('/vendor/three.module.js');
    const {stationModel,spacecraftModel}=await import('/models.js');
    const {createDamageEffects}=await import('/damage-effects.js');
    const {Flight,Station}=await import('/state.js');
    const world=new THREE.Scene(),station=stationModel(1),own=spacecraftModel(0),other=spacecraftModel(1);
    for(const owner of [station,own,other]) {
      world.add(owner.group);owner.velocity=new THREE.Vector3();owner.offset=new THREE.Vector3();
    }
    const effects=createDamageEffects(world,station,[own,other]);
    const local=Array.from({length:35},(_,i)=>window.physics.component(i)),remote=[...local],structure=new Array(15).fill(0);
    local[Flight.status]=1;
    Object.assign(remote,{[Flight.status]:2,[Flight.normalZ]:-1,[Flight.impactSpeed]:30,[Flight.impactAge]:1,[Flight.impactSequence]:1,[Flight.impactMass]:2100,[Flight.impactPart]:-1});
    structure[Station.brokenPanels]=1;
    effects.update([local,remote],structure,0.1);
    const before=world.children.filter(p=>p.name.endsWith('-fragment')).length;
    effects.reset();
    return {before,after:effects.advance(0).fragments,meshes:world.children.filter(p=>p.name.endsWith('-fragment')).length,
      hidden:[...station.fragments,...other.fragments,...other.pressurePanels].filter(p=>!p.visible).length};
  });
  expect(result.before).toBeGreaterThan(24);
  expect(result.after).toBe(0);expect(result.meshes).toBe(0);expect(result.hidden).toBe(0);
});
test('nose ray ends on real station geometry and disappears in open space',async ({page})=>{
  await controlledFlight(page);
  await pose(page,{2:-18,5:0});
  const hit=await page.evaluate(()=>{
    const ray=window.stationObject.parent.getObjectByName('nose-ray');
    const mark=window.stationObject.parent.getObjectByName('nose-hit');
    return ray?{visible:ray.visible,start:Array.from(ray.geometry.attributes.position.array).slice(0,3),end:Array.from(ray.geometry.attributes.position.array).slice(3),mark:mark.visible}:null;
  });
  expect(hit).not.toBeNull();expect(hit.visible).toBe(true);expect(hit.mark).toBe(true);
  hit.start.forEach((v,i)=>expect(v).toBeCloseTo([-18,0,18][i],8));
  expect(hit.end[2]).toBeCloseTo(-0.2,6);
  await pose(page,{6:Math.cos(0.05),8:Math.sin(0.05)});
  const tilted=await page.evaluate(()=>{
    const ray=window.stationObject.parent.getObjectByName('nose-ray');
    return {visible:ray.visible,points:Array.from(ray.geometry.attributes.position.array)};
  });
  expect(tilted.visible).toBe(true);
  expect(tilted.points[0]).toBeCloseTo(-18+3.2*Math.sin(0.1),5);
  expect(tilted.points[2]).toBeCloseTo(21.2-3.2*Math.cos(0.1),5);
  expect((tilted.points[3]-tilted.points[0])/(tilted.points[5]-tilted.points[2])).toBeCloseTo(-Math.tan(0.1),5);
  await pose(page,{0:100});
  expect(await page.evaluate(()=>window.stationObject.parent.getObjectByName('nose-ray').visible)).toBe(false);
  expect(await page.evaluate(()=>window.stationObject.parent.getObjectByName('nose-hit').visible)).toBe(false);
});

test('docking plays a capture pulse and counts the awarded score once',async ({page})=>{
  await controlledFlight(page);
  await pose(page,{2:-0.05,5:0.05},20);
  expect(await page.evaluate(()=>window.physics.component(15))).toBe(1);
  expect(await page.evaluate(()=>window.stationObject.parent.getObjectByName('capture-pulse')?.visible)).toBe(true);
  await expect(page.locator('#results')).toHaveAttribute('data-docked','true');
  await expect(page.locator('#score-award')).toBeVisible();
  await pose(page,{},2500);
  expect(Number(await page.locator('#award-value').textContent())).toBe(await page.evaluate(()=>Math.round(window.physics.component(16))));
  expect(await page.evaluate(()=>window.stationObject.parent.getObjectByName('capture-pulse').visible)).toBe(false);
  await pose(page,{},100);
  expect(await page.evaluate(()=>window.stationObject.parent.getObjectByName('capture-pulse').visible)).toBe(false);
});
