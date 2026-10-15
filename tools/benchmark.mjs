import { chromium } from '@playwright/test';
import { writeFile } from 'node:fs/promises';

const url=process.env.APP_URL||'http://127.0.0.1:8080';
const arena=process.env.ARENA==='1',pageUrl=new URL(arena?'/arena':'/',url).href,practiceButton=arena?'Recovery training':'Practice flight';
const hardware=process.env.GPU_BACKEND==='hardware';
const viewport={width:Number(process.env.WIDTH||1280),height:Number(process.env.HEIGHT||720)};
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||'/etc/profiles/per-user/uynx/bin/chromium',args:hardware?['--use-gl=angle','--use-angle=gl']:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try {
  const page=await browser.newPage({viewport});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(()=>{
    Math.random=()=>0.25;
    window.requestAnimationFrame=callback=>{window.flightFrame=callback;return 1;};
    const instantiate=WebAssembly.instantiate;
    WebAssembly.instantiate=async (...args)=>{
      const result=await instantiate(...args);window.physics=result.instance.exports;return result;
    };
  });
  await page.goto(pageUrl);
  await page.getByRole('button',{name:practiceButton,exact:true}).click({timeout:30000});
  if(process.env.QUALITY)await page.getByLabel('Graphics quality').selectOption(process.env.QUALITY);
  const results=await page.evaluate(async ({probe,arena})=>{
    const THREE=await import('/vendor/three.module.js');
    const tally={renderMs:0,calls:0,triangles:0};
    THREE.Scene.prototype.onBeforeRender=function(renderer){
      if(window.measuredRenderer)return;
      window.measuredRenderer=renderer;
      const render=renderer.render;
      renderer.render=function(...args){
        if(probe==='no-render')return;
        if(probe==='no-shadows')this.shadowMap.enabled=false;
        const start=performance.now();const result=render.apply(this,args);tally.renderMs+=performance.now()-start;
        tally.calls+=this.info.render.calls;tally.triangles+=this.info.render.triangles;return result;
      };
    };
    const sim=window.physics,gl=document.getElementById('viewport').getContext('webgl2');
    const summary=values=>{const sorted=[...values].sort((a,b)=>a-b);return {mean:values.reduce((a,b)=>a+b,0)/values.length,p50:sorted[Math.floor(sorted.length/2)],p95:sorted[Math.floor(sorted.length*0.95)],max:sorted.at(-1)};};
    const poses={approach:{},collar:{0:0,1:0,2:-0.2,5:30,6:1,7:0,8:0,9:0},wreck:{0:0,1:0,2:-0.2,5:30,6:1,7:0,8:0,9:0},wing:{0:8,1:4,2:8,5:50,6:1,7:0,8:0,9:0}};
    const debug=gl.getExtension('WEBGL_debug_renderer_info');
    const output={probe,renderer:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),viewport:[gl.drawingBufferWidth,gl.drawingBufferHeight],scenarios:{}};
    let tick=performance.now();
    for(const [name,pose] of Object.entries(poses)) {
      document.getElementById(arena?'training':'practice').click();if(arena)sim.reset_combat(0,1);else sim.reset_flight(123);
      for(const [i,v] of Object.entries(pose))sim.restore(Number(i),v);
      const physics=[];
      for(let i=0;i<120;i++){const start=performance.now();if(arena)sim.step_combat(0,0,0,0,0,0,0,-1,0,1);else {sim.step_flight(0,0,0,0,0,0,0);sim.judge_flight(0);}physics.push(performance.now()-start);}
      if(name==='collar'){if(arena)sim.reset_combat(0,1);else sim.reset_flight(123);for(const [i,v] of Object.entries(pose))sim.restore(Number(i),v);}
      for(let i=0;i<8;i++){window.flightFrame(tick+=16.6667);gl.finish();}
      const frames=[];Object.keys(tally).forEach(key=>tally[key]=0);
      for(let i=0;i<20;i++){const start=performance.now();window.flightFrame(tick+=16.6667);gl.finish();frames.push(performance.now()-start);}
      output.scenarios[name]={frameMs:summary(frames),physicsTickMs:summary(physics),renderMs:tally.renderMs/20,drawCalls:tally.calls/20,triangles:tally.triangles/20,fragments:Number(document.getElementById('viewport').dataset.fragments),slowTicks:physics.map((ms,i)=>({i,ms})).filter(v=>v.ms>8)};
    }
    return output;
  },{probe:process.env.PROBE||'full',arena});
  if(process.env.REALTIME==='1') {
    await page.close();
    const realtime=await browser.newPage({viewport});
    realtime.on('pageerror',error=>errors.push(error.message));
    await realtime.addInitScript(()=>{
      Math.random=()=>0.25;
      const request=window.requestAnimationFrame.bind(window);let last;
      window.requestAnimationFrame=callback=>request(now=>{
        const start=performance.now();callback(now);
        if(window.frameSamples){window.frameSamples.frameMs.push(performance.now()-start);if(last!==undefined)window.frameSamples.intervalMs.push(now-last);}
        last=now;
      });
      const instantiate=WebAssembly.instantiate;
      WebAssembly.instantiate=async (...args)=>{const result=await instantiate(...args);window.physics=result.instance.exports;return result;};
    });
    await realtime.goto(pageUrl);
    await realtime.getByRole('button',{name:practiceButton,exact:true}).click({timeout:30000});
    if(process.env.QUALITY)await realtime.getByLabel('Graphics quality').selectOption(process.env.QUALITY);
    results.realtime=await realtime.evaluate(async ({arena,probe})=>{
    if(probe==='no-shadows'||probe==='no-render') {
      const THREE=await import('/vendor/three.module.js');
      THREE.Scene.prototype.onBeforeRender=function(renderer){if(probe==='no-render'){renderer.render=()=>{};renderer.clear=()=>{};}else renderer.shadowMap.enabled=false;};
    }
    if(probe==='no-hud')for(const id of ['combat-ui','hangar'])document.getElementById(id).hidden=true;
    const output={};
    for(const name of ['approach','wing']) {
      document.getElementById(arena?'training':'practice').click();if(arena)window.physics.reset_combat(0,1);else window.physics.reset_flight(123);
      await new Promise(resolve=>setTimeout(resolve,500));
      window.frameSamples={frameMs:[],intervalMs:[]};
      if(name==='wing')for(const [i,v]of Object.entries({0:8,1:4,2:8,5:50,6:1,7:0,8:0,9:0}))window.physics.restore(Number(i),v);
      await new Promise(resolve=>setTimeout(resolve,4000));
      const summary=values=>{if(!values.length)throw new Error('No animation frames recorded');const sorted=[...values].sort((a,b)=>a-b);return {mean:values.reduce((a,b)=>a+b,0)/values.length,p95:sorted[Math.floor(sorted.length*0.95)],max:sorted.at(-1)};};
      output[name]={frames:window.frameSamples.frameMs.length,frameMs:summary(window.frameSamples.frameMs),intervalMs:summary(window.frameSamples.intervalMs)};window.frameSamples=undefined;
    }
    return output;
    },{arena,probe:process.env.PROBE||'full'});
    await realtime.setViewportSize({width:3840,height:2160});
    results.resizedBuffer=await realtime.evaluate(()=>{dispatchEvent(new Event('resize'));const canvas=document.getElementById('viewport');return [canvas.width,canvas.height];});
    if(results.resizedBuffer[0]*results.resizedBuffer[1]>1920*1080)throw new Error('Resize exceeds the render pixel budget');
  }
  if(errors.length)throw new Error(errors.join('\n'));
  console.log(JSON.stringify(results,null,2));
  if(process.argv[2])await writeFile(process.argv[2],JSON.stringify(results,null,2)+'\n');
  if(process.env.PHYSICS_BUDGET_MS&&Object.values(results.scenarios).some(s=>s.physicsTickMs.p95>Number(process.env.PHYSICS_BUDGET_MS)))process.exitCode=1;
} finally {await browser.close();}
