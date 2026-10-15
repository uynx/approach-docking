import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {pilotControls,tutorialLessons} from '../web/tutorial.js';

async function flight(seed=0) {
  const {instance}=await WebAssembly.instantiate(await readFile(new URL('../build/web/physics.wasm',import.meta.url)),{
    env:{acos:Math.acos,sin:Math.sin,cos:Math.cos,exp:Math.exp,log:Math.log}
  });
  instance.exports.reset_flight(seed);return instance.exports;
}

test('the tutorial pilot docks from the normal tilted start using legal thrust',async()=>{
  const sim=await flight();
  for(let tick=0;tick<18000&&!sim.component(15);tick++) {
    const state=Array.from({length:sim.state_size()},(_,i)=>sim.component(i)),axes=pilotControls(state);
    assert.equal(axes.length,6);
    assert.ok(axes.every(v=>Number.isFinite(v)&&Math.abs(v)<=1));
    sim.step_flight(...axes,0);sim.judge_flight(0);
  }
  assert.equal(sim.component(15),1,'the shared physics awards a dock');
  assert.ok(Math.hypot(sim.component(0),sim.component(1))<0.06,'the pilot centres the port');
  assert.ok(sim.flight_alignment()<0.8,'the pilot stops with a straight docking attitude');
  assert.ok(sim.component(5)<0.06,'the pilot brakes to a gentle capture');
  assert.ok(sim.component(16)>850,'precision earns a strong real score');
  assert.ok(sim.component(14)>10&&sim.component(13)<80,'the flight spends actual time and fuel');
});

test('the missed-braking example produces a severe physical impact',async()=>{
  const sim=await flight(),lesson=tutorialLessons.find(lesson=>lesson.id==='braking');
  for(const [field,value] of Object.entries(lesson.pose))sim.restore(Number(field),value);
  for(let tick=0;tick<900&&!sim.component(15);tick++) {
    sim.step_flight(0,0,1,0,0,0,0);sim.judge_flight(0);
  }
  sim.step_flight(0,0,0,0,0,0,0);
  assert.equal(sim.component(15),2);
  assert.ok(sim.component(20)>20,'the hit is a high-speed collision');
  assert.ok(sim.component(28)>1000,'the impact transfers substantial effective mass');
});

test('the off-centre and wing examples hit actual hardware and tear the wing',async()=>{
  for(const id of ['offset','wing']) {
    const sim=await flight(),lesson=tutorialLessons.find(lesson=>lesson.id===id);
    for(const [field,value] of Object.entries(lesson.pose))sim.restore(Number(field),value);
    for(let tick=0;tick<1200;tick++){sim.step_flight(0,0,0,0,0,0,0);sim.judge_flight(0);}
    assert.equal(sim.component(15),2,`${id} ends in a real collision`);
    if(id==='wing')assert.ok(sim.station_component(13)>0,'the station loses its struck panel');
    else assert.ok(Math.hypot(sim.component(10),sim.component(11),sim.component(12))>0.2,'the rim strike tumbles the capsule');
  }
});

test('the tutorial pilot handles varied launch attitudes',async()=>{
  for(const seed of [113,3248253,0xdeadbeef,0xffffffff]) {
    const sim=await flight(seed);
    for(let tick=0;tick<18000&&!sim.component(15);tick++) {
      const state=Array.from({length:sim.state_size()},(_,i)=>sim.component(i));
      sim.step_flight(...pilotControls(state),0);sim.judge_flight(0);
    }
    assert.equal(sim.component(15),1,`launch ${seed} docks through normal physics`);
    assert.ok(sim.component(16)>850);
  }
});

test('the crash lab includes real sideways, tail, glancing, tank and two-ship impacts',async()=>{
  for(const id of ['side-slow','side-fast','tail','glancing','tank','station-tank','head-on','tumble']) {
    const lesson=tutorialLessons.find(lesson=>lesson.id===id);
    assert.ok(lesson,`the lab offers ${id}`);
    const sim=await flight();
    for(const [field,value] of Object.entries(lesson.pose))sim.restore(Number(field),value);
    if(lesson.opponent){sim.set_opponent(1);for(const [field,value] of Object.entries(lesson.opponent))sim.restore_opponent(Number(field),value);}
    let collided=false,ruptured=false;
    for(let tick=0;tick<1200;tick++) {
      sim.step_flight(0,0,0,0,0,0,0);sim.judge_flight(0);
      if(sim.component(31)>0)collided=true;
      if(sim.station_component(14)>0||sim.component(33)>0)ruptured=true;
    }
    assert.ok(collided,`${id} contacts real collision geometry`);
    if(id==='head-on')assert.ok(sim.opponent_component(31)>0,'both spacecraft receive impact metadata');
    if(id==='tank'||id==='station-tank')assert.ok(ruptured,'the tank scenario ruptures actual propellant hardware');
  }
});
